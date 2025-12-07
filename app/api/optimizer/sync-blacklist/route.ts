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

async function fetchBlacklistedFromPropeller(campaignId: string): Promise<{ zones: string[] | null; status: number | null; error?: string; raw?: string | null }> {
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
    return { zones, status: res.status, raw: txt };
  } catch (e: any) {
    console.error("[SyncBlacklist] Provider fetch error", campaignId, e?.message || String(e));
    return { zones: null, status: null, error: e?.message || String(e), raw: null };
  }
}

async function fetchPropellerCampaigns(): Promise<Array<{ id: number | string; name?: string }>> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return [];
  const baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  const url = `${baseUrl.replace(/\/$/, "")}/v5/adv/campaigns?page_size=1000`;
  try {
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const list = json?.result || json?.campaigns || [];
    return Array.isArray(list) ? list.map((c: any) => ({ id: c.id, name: c.name })) : [];
  } catch (e) {
    return [];
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
    // return list of { id, name } strings as 'id::name' to preserve both
    const items: { id: string; name?: string }[] = (json?.campaigns || []).map((c: any) => ({ id: String(c.id), name: c?.name ? String(c.name) : undefined }));
    return Array.from(new Set(items.map((it) => `${it.id}::${it.name || ""}`))).map((s) => s);
  } catch {
    return [];
  }
}

async function runSync(req: NextRequest, campaignIds: string[] | undefined, dateRange: string, dryRun = false) {

    const seenList = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
    const seenSet = new Set<string>(
      seenList.map((e: any) => `${String(e.campaignId)}:${String(e.zoneId)}`)
    );

    // dashboardIds are strings; they may be numeric propeller IDs or dashboard UUIDs.
    const rawIds = campaignIds && campaignIds.length > 0 ? campaignIds : await getCampaignIdsFromDashboard(req, dateRange);
    // rawIds may be in form 'id::name' when coming from dashboard; parse to objects
    const dashboardList: { id: string; name?: string }[] = rawIds.map((r) => {
      const parts = String(r).split("::");
      return { id: parts[0], name: parts[1] || undefined };
    });

    // Fetch propeller campaigns to map names -> numeric ids
    const propellerCampaigns = await fetchPropellerCampaigns();
    const nameToId = new Map<string, string>();
    for (const pc of propellerCampaigns) {
      if (pc.name) nameToId.set(pc.name, String(pc.id));
    }

    const ids: string[] = [];
    const unresolved: string[] = [];

    // Load manual mappings from KV. Structure: { [dashboardIdOrName]: providerId }
    const mappingKey = "mapping:dashboardToProvider";
    const rawMapping = (await kv.get(mappingKey)) as Record<string, string> | null;
    const manualMap = rawMapping || {};

    function extractNumericFromName(n?: string) {
      if (!n) return null;
      // Match a run of 6+ digits even if adjacent to underscores or non-word chars
      const m = n.match(/(?:^|[^0-9])(\d{6,})(?=$|[^0-9])/);
      return m ? m[1] : null;
    }

    for (const d of dashboardList) {
      // If the dashboard id is already numeric, use it
      if (/^\d+$/.test(d.id)) {
        ids.push(d.id);
        continue;
      }

      // 0) Manual mapping: check by dashboard id first, then by dashboard name
      // Manual mapping may contain a special value '__IGNORED__' meaning skip this dashboard entry
      if (manualMap[d.id] === "__IGNORED__" || (d.name && manualMap[d.name] === "__IGNORED__")) {
        // skip — intentionally ignored
        continue;
      }
      if (manualMap[d.id]) {
        ids.push(String(manualMap[d.id]));
        continue;
      }
      if (d.name && manualMap[d.name]) {
        ids.push(String(manualMap[d.name]));
        continue;
      }

      // 1) If dashboard name contains a large numeric token, use that as Propeller ID
      const numericFromName = extractNumericFromName(d.name);
      if (numericFromName) {
        ids.push(numericFromName);
        continue;
      }

      // 2) Exact name match
      if (d.name && nameToId.has(d.name)) {
        ids.push(nameToId.get(d.name)!);
        continue;
      }

      // 3) Substring matches: propellerName includes dashboard name or vice versa
      let matched = false;
      if (d.name) {
        const dn = d.name.toLowerCase();
        for (const [pname, pid] of nameToId.entries()) {
          if (!pname) continue;
          const pn = pname.toLowerCase();
          if (pn.includes(dn) || dn.includes(pn)) {
            ids.push(pid);
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;

      unresolved.push(d.id + (d.name ? ` (${d.name})` : ""));
    }

    // dedupe
    const uniqueIds = Array.from(new Set(ids));
    // filter out any special sentinel values (e.g. '__IGNORED__') to avoid accidental provider calls
    const fetchIds = uniqueIds.filter((id) => id !== "__IGNORED__");

    const newEntries: any[] = [];
    const diagnostics: Array<{ campaignId: string; fetched: number | null; status: number | null; error?: string }> = [];
    if (unresolved.length > 0) {
      diagnostics.push({ campaignId: "_unresolved", fetched: null, status: null, error: `unresolved_dashboard_campaigns:${unresolved.join(",")}` });
    }
    for (const cid of fetchIds) {
      const resp = await fetchBlacklistedFromPropeller(String(cid));
      diagnostics.push({ campaignId: String(cid), fetched: resp.zones ? resp.zones.length : null, status: resp.status, error: resp.error, snippet: resp.raw ? String(resp.raw).slice(0, 1024) : null });
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

    if (!dryRun && newEntries.length > 0) {
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
    const dryRun = Boolean(body?.dryRun);
    const result = await runSync(req, campaignIds, dateRange, dryRun);
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
    const dryRun = Boolean(searchParams.get("dryRun"));
    const result = await runSync(req, ids.length ? ids : undefined, dateRange, dryRun);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "sync_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
