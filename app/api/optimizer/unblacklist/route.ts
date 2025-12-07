import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

async function unblacklistZoneInPropeller(zone: { campaignId: string; zoneId: string }): Promise<{ ok: boolean; message: string }> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return { ok: true, message: "Dry-run: no token set" };
  const baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com/v5";
  const url = `${baseUrl}/adv/campaigns/${encodeURIComponent(zone.campaignId)}/zones/blacklist`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ zone_ids: [zone.zoneId] }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, message: `Propeller API error (${res.status}): ${txt || res.statusText}` };
    }
    return { ok: true, message: "Zone removed from blacklist via Propeller API." };
  } catch (err: any) {
    return { ok: false, message: `Propeller API call failed: ${err?.message || String(err)}` };
  }
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
