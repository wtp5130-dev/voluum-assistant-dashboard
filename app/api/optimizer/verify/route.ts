import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

function normalizeId(v: any): string | null {
  try {
    const s = String(v);
    const digits = s.replace(/\D+/g, "");
    return digits.length ? digits : s.trim() || null;
  } catch { return null; }
}

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
    if (!json) return null;
    
    // Debug: log the raw response for first campaign
    if (campaignId === "9857527") {
      console.log("[VERIFY DEBUG] Campaign 9857527 raw response:", JSON.stringify(json).substring(0, 500));
    }
    
    const ids = new Set<string>();
    const push = (v: any) => { 
      const n = normalizeId(v); 
      if (n && n.length >= 4 && n.length <= 12) ids.add(n); // Reasonable zone ID length
    };
    
    // Extract from known array fields
    const raw: any[] = (json?.zone_ids || json?.zones || json?.data || []) as any[];
    if (Array.isArray(raw) && raw.length > 0) {
      for (const z of raw) {
        if (z == null) continue;
        if (typeof z === "string" || typeof z === "number") { 
          push(z); 
        } else if (typeof z === "object") {
          // Try common field names
          const v = (z as any).zone_id ?? (z as any).zoneId ?? (z as any).publisher_zone_id ?? (z as any).publisherZoneId ?? (z as any).placement_id ?? (z as any).placementId ?? (z as any).id ?? (z as any).zone;
          if (v != null) push(v);
        }
      }
    }
    
    return ids;
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

    // Group targets by campaign - use Map with entry IDs to ensure we update the right objects in list
    const byCampaign = new Map<string, { providerCid: string; entries: any[] }>();
    const entryIndexMap = new Map<any, number>(); // Track which list index each entry is at
    
    for (let idx = 0; idx < list.length; idx++) {
      const entry = list[idx];
      if (entry.reverted) continue; // skip reverted
      // Only process if in targets
      if (!targets.includes(entry)) continue;
      
      const cid = String(entry.campaignId);
      const providerCid = await resolveProviderCampaignId(cid);
      if (!byCampaign.has(providerCid)) byCampaign.set(providerCid, { providerCid, entries: [] });
      byCampaign.get(providerCid)!.entries.push(entry);
      entryIndexMap.set(entry, idx);
    }

    let campaignsProcessed = 0;
    let campaignsSkipped = 0;
    let entriesChecked = 0;
    let verifiedTrue = 0;
    let verifiedFalse = 0;
    const debugInfo: Record<string, { 
      total: number; 
      sample: string[];
      checking: string[];
      providerZones: string[];
    }> = {};

    // Verify each campaign's blacklist
    for (const [providerCid, bucket] of byCampaign.entries()) {
      const set = await fetchBlacklistedFromPropeller(providerCid);
      if (!set) { 
        campaignsSkipped++; 
        console.log(`[VERIFY] Campaign ${providerCid} - API returned null (likely error or no access)`);
        continue; 
      }
      campaignsProcessed++;
      console.log(`[VERIFY] Campaign ${providerCid} - Found ${set.size} zones in provider`);
      
      // Collect zones we're checking for this campaign
      const checkingZones = bucket.entries.map(e => normalizeId(e.zoneId) || e.zoneId).slice(0, 10);
      
      // Store debug info: first 10 zone IDs from provider and what we're checking
      debugInfo[providerCid] = { 
        total: set.size,
        sample: Array.from(set).slice(0, 10),
        checking: checkingZones,
        providerZones: Array.from(set)
      };
      
      for (const e of bucket.entries) {
        const normalized = normalizeId(e.zoneId);
        const present = set.has(normalized || "");
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
      JSON.stringify({ 
        ok: true, 
        campaigns: { processed: campaignsProcessed, skipped: campaignsSkipped, total: byCampaign.size }, 
        entries: { checked: entriesChecked, verifiedTrue, verifiedFalse },
        debug: debugInfo
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "verify_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
