import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

function buildProviderUrl(campaignId: string) {
  let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  // Default to the targeting exclude zone endpoint (per Swagger)
  const pathTmpl =
    process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(campaignId));
  // Normalize: avoid duplicated /v5 or double slashes when baseUrl already contains a version segment
  // Remove trailing slash from baseUrl
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  // If baseUrl already contains /v5 and path starts with /v5, strip leading /v5 from path
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  // Ensure path begins with a single slash
  if (!path.startsWith("/")) path = `/${path}`;
  return `${baseUrl}${path}`;
}

function extractZonesFromJson(json: any): string[] {
  // Support configurable JSON path to array
  const jsonPath = process.env.PROPELLER_GET_BLACKLIST_JSON_PATH; // e.g., "data.zone_ids"
  let node: any = json;
  if (jsonPath) {
    try {
      for (const key of jsonPath.split(".")) {
        if (!key) continue;
        node = node?.[key];
      }
    } catch {}
  }
  // include common names: zone, zone_ids, zones, data, items
  const candidates: any[] = [node, json?.zone, json?.zone_ids, json?.zones, json?.data, json?.items].filter(Boolean);
  const arr = Array.isArray(candidates[0]) ? candidates[0] : [];
  return (arr || []).map((z: any) => String(typeof z === "object" && z?.zoneId ? z.zoneId : z));
}

async function fetchBlacklistedFromPropeller(campaignId: string): Promise<{ zones: string[] | null; status: number | null; error?: string }> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return { zones: null, status: null, error: "missing_token" };
  const url = buildProviderUrl(campaignId);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const txt = await res.text();
    if (!res.ok) {
      console.warn("[SyncBlacklist] Provider GET failed", campaignId, res.status, txt?.slice(0, 200));
      return { zones: null, status: res.status, error: txt?.slice(0, 200) };
    }
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) {
      console.warn("[SyncBlacklist] Provider JSON parse failed", campaignId, txt?.slice(0, 200));
      return { zones: null, status: res.status, error: "invalid_json" };
    }
    const zones = extractZonesFromJson(json);
    return { zones, status: res.status };
  } catch (e: any) {
    console.error("[SyncBlacklist] Provider fetch error", campaignId, e?.message || String(e));
    return { zones: null, status: null, error: e?.message || String(e) };
  }
}

function getBaseUrl(req: NextRequest): string {
  try {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || process.env.VERCEL_URL || "localhost:3000";
    return `${proto}://${host}`;
  } catch {
    return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  }
}

async function getCampaignIdsFromDashboard(req: NextRequest, dateRange: string): Promise<string[]> {
  try {
    const base = getBaseUrl(req);
    const res = await fetch(`${base}/api/voluum-dashboard?dateRange=${encodeURIComponent(dateRange)}`);
    if (!res.ok) return [];
    const json = await res.json();
    const ids: string[] = (json?.campaigns || []).map((c: any) => String(c.id)).filter(Boolean);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

async function runSync(req: NextRequest, campaignIds: string[] | undefined, dateRange: string) {

    const seenList = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
    const seenSet = new Set<string>(
      seenList.map((e: any) => `${String(e.campaignId)}:${String(e.zoneId)}`)
    );

    let ids = campaignIds && campaignIds.length > 0 ? campaignIds : await getCampaignIdsFromDashboard(req, dateRange);
    ids = Array.from(new Set(ids));

    const newEntries: any[] = [];
    const diagnostics: Array<{ campaignId: string; fetched: number | null; status: number | null; error?: string }> = [];
    for (const cid of ids) {
      const resp = await fetchBlacklistedFromPropeller(String(cid));
      diagnostics.push({ campaignId: String(cid), fetched: resp.zones ? resp.zones.length : null, status: resp.status, error: resp.error });
      if (!resp.zones) continue;
      for (const zid of resp.zones) {
        const key = `${cid}:${zid}`;
        if (seenSet.has(key)) continue;
        seenSet.add(key);
        newEntries.push({
          id: crypto.randomUUID(),
          campaignId: String(cid),
          zoneId: String(zid),
          provider: "propellerads",
          timestamp: new Date().toISOString(),
          synced: true,
          verified: true,
          verifiedAt: new Date().toISOString(),
        });
      }
    }

    if (newEntries.length > 0) {
      const updated = [...seenList, ...newEntries];
      // rewrite list preserving order
      await kv.del(LIST_KEY);
      for (let i = updated.length - 1; i >= 0; i--) {
        await kv.lpush(LIST_KEY, updated[i]);
      }
    }

    return { ok: true, campaigns: ids.length, added: newEntries.length, diagnostics };
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const campaignIds: string[] | undefined = Array.isArray(body?.campaignIds)
      ? (body.campaignIds as string[])
      : undefined;
    const dateRange: string = (body?.dateRange as string) || "last7days";
    const result = await runSync(req, campaignIds, dateRange);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "sync_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get("dateRange") || "last7days";
    const ids = searchParams.getAll("campaignId");
    const result = await runSync(req, ids.length ? ids : undefined, dateRange);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "sync_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
