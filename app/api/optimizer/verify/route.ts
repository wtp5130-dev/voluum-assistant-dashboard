import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

async function fetchBlacklistedFromPropeller(campaignId: string): Promise<Set<string> | null> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return null;
  let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  const pathTmpl = process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(campaignId));
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const raw: any[] = (json?.zone_ids || json?.zones || json?.data || []) as any[];
    const arr = Array.isArray(raw) ? raw : [];
    const mapId = (z: any): string | null => {
      if (z == null) return null;
      if (typeof z === "string" || typeof z === "number") return String(z).trim();
      if (typeof z === "object") {
        const v = z.zone_id ?? z.zoneId ?? z.id ?? z.zone ?? z.value ?? z.key;
        return v != null ? String(v).trim() : null;
      }
      try { return String(z).trim(); } catch { return null; }
    };
    const set = new Set<string>((arr || []).map(mapId).filter((v: any) => typeof v === "string" && v.length > 0) as string[]);
    return set;
  } catch {
    return null;
  }
}

/** Resolve dashboard campaignId to provider campaign id using KV mapping when needed */
async function resolveProviderCampaignId(dashboardId: string): Promise<string> {
  if (/^\d+$/.test(dashboardId)) return dashboardId;
  try {
    // Use same key as apply route
    const mapping = (await kv.get("mapping:dashboardToProvider")) as
      | Record<string, string>
      | null;
    if (mapping && mapping[dashboardId]) return String(mapping[dashboardId]);
  } catch {}
  // Try extracting a long numeric token from dashboard id (or name-like id)
  const m = dashboardId.match(/(?:^|[^0-9])(\d{6,})(?=$|[^0-9])/);
  if (m && m[1]) return m[1];
  return dashboardId;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    if (!process.env.PROPELLER_API_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_token", message: "PROPELLER_API_TOKEN is not set on the server; cannot verify against provider." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    const body = await req.json().catch(() => ({}));
    const items = (body?.items as Array<{ id?: string; campaignId: string; zoneId: string }> | undefined) || undefined;

    const list = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
    const targets = items && items.length > 0 ? list.filter((e) => items.some((it) => (!it.id || e.id === it.id) && e.campaignId === it.campaignId)) : list;

    // Group targets by campaign
    const byCampaign = new Map<string, { providerCid: string; entries: any[] }>();
    for (const entry of targets) {
      if (entry.reverted) continue; // skip reverted
      const cid = String(entry.campaignId);
      const providerCid = await resolveProviderCampaignId(cid);
      if (!byCampaign.has(providerCid)) byCampaign.set(providerCid, { providerCid, entries: [] });
      byCampaign.get(providerCid)!.entries.push(entry);
    }

    let campaignsProcessed = 0;
    let campaignsSkipped = 0;
    let entriesChecked = 0;
    let verifiedTrue = 0;
    let verifiedFalse = 0;

    // Verify each campaign's blacklist
    for (const [providerCid, bucket] of byCampaign.entries()) {
      const set = await fetchBlacklistedFromPropeller(providerCid);
      if (!set) { campaignsSkipped++; continue; }
      campaignsProcessed++;
      for (const e of bucket.entries) {
        const present = set.has(String(e.zoneId));
        entriesChecked++;
        e.verified = present;
        e.verifiedAt = new Date().toISOString();
        if (present) verifiedTrue++; else verifiedFalse++;
      }
    }

    // Write back full list preserving order
    await kv.del(LIST_KEY);
    for (let i = list.length - 1; i >= 0; i--) {
      await kv.lpush(LIST_KEY, list[i]);
    }

    return new Response(
      JSON.stringify({ ok: true, campaigns: { processed: campaignsProcessed, skipped: campaignsSkipped, total: byCampaign.size }, entries: { checked: entriesChecked, verifiedTrue, verifiedFalse } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "verify_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
