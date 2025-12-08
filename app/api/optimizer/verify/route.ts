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
    const arr: string[] = (json?.zone_ids || json?.zones || json?.data || []) as any[];
    const set = new Set<string>((arr || []).map((z) => String(z)));
    return set;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const items = (body?.items as Array<{ id?: string; campaignId: string; zoneId: string }> | undefined) || undefined;

    const list = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
    const targets = items && items.length > 0 ? list.filter((e) => items.some((it) => (!it.id || e.id === it.id) && e.campaignId === it.campaignId)) : list;

    // Group targets by campaign
    const byCampaign = new Map<string, any[]>();
    for (const entry of targets) {
      if (entry.reverted) continue; // skip reverted
      const cid = String(entry.campaignId);
      if (!byCampaign.has(cid)) byCampaign.set(cid, []);
      byCampaign.get(cid)!.push(entry);
    }

    // Verify each campaign's blacklist
    for (const [cid, entries] of byCampaign.entries()) {
      const set = await fetchBlacklistedFromPropeller(cid);
      if (!set) continue;
      for (const e of entries) {
        const present = set.has(String(e.zoneId));
        e.verified = present;
        e.verifiedAt = new Date().toISOString();
      }
    }

    // Write back full list preserving order
    await kv.del(LIST_KEY);
    for (let i = list.length - 1; i >= 0; i--) {
      await kv.lpush(LIST_KEY, list[i]);
    }

    return new Response(JSON.stringify({ ok: true, verified: byCampaign.size }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "verify_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
