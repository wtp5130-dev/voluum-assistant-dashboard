import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

async function unblacklistZoneInPropeller(zone: { campaignId: string; zoneId: string }): Promise<{ ok: boolean; message: string }> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return { ok: true, message: "Dry-run: no token set" };

  // Build provider URL using the same configurable path as the sync route so
  // we target the same endpoint Propeller exposes for blacklist management.
  let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  const pathTmpl = process.env.PROPELLER_DELETE_BLACKLIST_PATH || process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(zone.campaignId));
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const url = `${baseUrl}${path}`;

  // Try the configured path first using the documented flow: GET the exclude list,
  // remove the zone, then PUT the updated list. If that fails, fall back to other
  // common delete/append attempts.
  const tried: Array<{ url: string; status?: number; ok?: boolean; text?: string }> = [];
  const fallbackPaths = [
    // Common path used by sync logic
    "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone",
    // Older/hardcoded path that was used previously
    "/v5/adv/campaigns/{campaignId}/zones/blacklist",
  ];

  const candidateUrls = [url];
  for (const p of fallbackPaths) {
    const pp = p.replace("{campaignId}", encodeURIComponent(zone.campaignId));
    if (!pp) continue;
    let b = baseUrl;
    if (b.endsWith("/")) b = b.slice(0, -1);
    let candidatePath = pp;
    if (b.match(/\/v\d+(?:$|\/)/) && candidatePath.match(/^\/v\d+\//)) {
      candidatePath = candidatePath.replace(/^\/v\d+/, "");
    }
    if (!candidatePath.startsWith("/")) candidatePath = `/${candidatePath}`;
    const candidate = `${b}${candidatePath}`;
    if (!candidateUrls.includes(candidate)) candidateUrls.push(candidate);
  }

  // First: try documented flow (GET -> modify -> PUT) on the primary URL
  try {
    const getRes = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const getTxt = await getRes.text().catch(() => "");
    tried.push({ url: url + " [GET]", status: getRes.status, ok: getRes.ok, text: getTxt?.slice(0, 1000) });
    if (getRes.ok) {
      let json: any = null;
      try { json = getTxt ? JSON.parse(getTxt) : null; } catch {}
      const existing: string[] = (json?.zone || json?.zone_ids || json?.zones || []) as string[];
      const normalized = Array.isArray(existing) ? existing.map((z: any) => String(z)) : [];
      // If zone not present, short-circuit
      if (!normalized.includes(String(zone.zoneId))) {
        return { ok: true, message: "Zone not present in provider exclude list." };
      }
      const updated = normalized.filter((z) => z !== String(zone.zoneId));
      // PUT the updated list (per docs PUT sets forbidden zones)
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ zone: updated }),
      });
      const putTxt = await putRes.text().catch(() => "");
      tried.push({ url: url + " [PUT]", status: putRes.status, ok: putRes.ok, text: putTxt?.slice(0, 1000) });
      if (putRes.ok) return { ok: true, message: "Zone removed from blacklist via Propeller PUT on targeting/exclude/zone." };
      // if PUT returned 404 or not ok, continue to fallbacks
      if (putRes.status !== 404) return { ok: false, message: `Propeller API error (${putRes.status}): ${putTxt || putRes.statusText}` };
    }
  } catch (e: any) {
    tried.push({ url: url + " [GET/PUT]", status: undefined, ok: false, text: String(e?.message || e) });
  }

  // If documented flow didn't work, try the configured path and other fallbacks with DELETE body
  for (const attemptUrl of candidateUrls) {
    try {
      const res = await fetch(attemptUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ zone_ids: [zone.zoneId] }),
      });
      const txt = await res.text().catch(() => "");
      tried.push({ url: attemptUrl, status: res.status, ok: res.ok, text: txt?.slice(0, 1000) });
      if (res.ok) {
        return { ok: true, message: "Zone removed from blacklist via Propeller API." };
      }
      // If 404, try next candidate; otherwise return the error
      if (res.status === 404) continue;
      return { ok: false, message: `Propeller API error (${res.status}): ${txt || res.statusText}` };
    } catch (err: any) {
      tried.push({ url: attemptUrl, status: undefined, ok: false, text: String(err?.message || err) });
    }
  }

  // Also try appended-zone variants (some APIs delete resources by path rather than body)
  const appendedUrls: string[] = [];
  for (const cu of candidateUrls) {
    // Ensure we don't duplicate
    const a1 = cu.endsWith("/") ? `${cu}${encodeURIComponent(zone.zoneId)}` : `${cu}/${encodeURIComponent(zone.zoneId)}`;
    const a2 = cu.endsWith("/") ? `${cu}zone/${encodeURIComponent(zone.zoneId)}` : `${cu}/zone/${encodeURIComponent(zone.zoneId)}`;
    if (!candidateUrls.includes(a1) && !appendedUrls.includes(a1)) appendedUrls.push(a1);
    if (!candidateUrls.includes(a2) && !appendedUrls.includes(a2)) appendedUrls.push(a2);
  }

  for (const attemptUrl of appendedUrls) {
    try {
      // Some servers expect no JSON body on path-based DELETE
      const res = await fetch(attemptUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const txt = await res.text().catch(() => "");
      tried.push({ url: attemptUrl, status: res.status, ok: res.ok, text: txt?.slice(0, 1000) });
      if (res.ok) {
        return { ok: true, message: "Zone removed from blacklist via Propeller API." };
      }
      if (res.status === 404) continue;
      return { ok: false, message: `Propeller API error (${res.status}): ${txt || res.statusText}` };
    } catch (err: any) {
      tried.push({ url: attemptUrl, status: undefined, ok: false, text: String(err?.message || err) });
    }
  }

  // If we get here, all attempts failed (likely 404). Return aggregated info for debugging.
  const summary = tried.map((t) => `${t.url} -> ${t.status ?? "ERR"}${t.ok ? " OK" : ""}${t.text ? `: ${t.text}` : ""}`).join(" | ");
  return { ok: false, message: `All Propeller DELETE attempts failed: ${summary}` };
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    const items = (body?.items as Array<{ id?: string; zoneId: string; campaignId: string }> | null) || [];
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const results: Array<{ campaignId: string; zoneId: string; ok: boolean; message: string }> = [];
    for (const it of items) {
      const r = await unblacklistZoneInPropeller({ campaignId: String(it.campaignId), zoneId: String(it.zoneId) });
      results.push({ campaignId: it.campaignId, zoneId: it.zoneId, ok: r.ok, message: r.message });
    }

    // Mark matching entries as reverted in KV history (keep audit trail)
    try {
      const list = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
      const updated = list.map((entry: any) => {
        if (items.some((it) => it.id && entry?.id === it.id)) {
          return { ...entry, reverted: true, revertedAt: new Date().toISOString() };
        }
        return entry;
      });
      await kv.del(LIST_KEY);
      for (let i = updated.length - 1; i >= 0; i--) {
        await kv.lpush(LIST_KEY, updated[i]);
      }
    } catch (e) {
      // ignore
    }

    // Write audit entry directly to KV (server-side) to avoid internal HTTP call failures
    try {
      const auditEntry = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        category: "optimizer",
        action: "unblacklist",
        items: results,
      };
      await kv.lpush("audit:events", auditEntry);
      await kv.ltrim("audit:events", 0, 999);
    } catch (e: any) {
      // ignore audit persistence errors
      console.warn("[unblacklist] failed to write audit entry", e?.message || String(e));
    }
    return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "unblacklist_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
