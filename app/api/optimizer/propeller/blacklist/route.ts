import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

function normalizeId(v: any): string | null {
  try {
    const s = String(v);
    const digits = s.replace(/\D+/g, "");
    return digits.length ? digits : s.trim() || null;
  } catch { return null; }
}

async function resolveProviderCampaignId(dashboardIdOrName: string): Promise<string> {
  if (/^\d+$/.test(dashboardIdOrName)) return dashboardIdOrName;
  try {
    const mapping = (await kv.get("mapping:dashboardToProvider")) as Record<string, string> | null;
    if (mapping) {
      if (mapping[dashboardIdOrName]) return String(mapping[dashboardIdOrName]);
      // try to find by case-insensitive name
      const key = Object.keys(mapping).find(k => k.toLowerCase() === dashboardIdOrName.toLowerCase());
      if (key) return String(mapping[key]);
    }
  } catch {}
  const m = dashboardIdOrName.match(/(?:^|[^0-9])(\d{6,})(?=$|[^0-9])/);
  if (m && m[1]) return m[1];
  return dashboardIdOrName;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const token = process.env.PROPELLER_API_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "missing_token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const urlObj = new URL(req.url);
    const dashboardId = urlObj.searchParams.get("dashboardId") || "";
    const providerParam = urlObj.searchParams.get("providerId") || "";
    const providerCid = providerParam || (dashboardId ? await resolveProviderCampaignId(dashboardId) : "");
    if (!providerCid) {
      return new Response(JSON.stringify({ ok: false, error: "missing_campaign" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
    let path = process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) path = path.replace(/^\/v\d+/, "");
    path = path.replace("{campaignId}", encodeURIComponent(providerCid));
    if (!path.startsWith("/")) path = `/${path}`;
    const fullUrl = `${baseUrl}${path}`;

    const res = await fetch(fullUrl, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `provider_${res.status}`, message: text?.slice(0,400) || "" }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const ids = new Set<string>();
    const push = (v: any) => { const n = normalizeId(v); if (n) ids.add(n); };
    const walk = (node: any, key?: string) => {
      if (node == null) return;
      if (typeof node === "string" || typeof node === "number") { push(node); return; }
      if (Array.isArray(node)) { for (const it of node) walk(it); return; }
      if (typeof node === "object") {
        const v = (node as any).zone_id ?? (node as any).zoneId ?? (node as any).publisher_zone_id ?? (node as any).publisherZoneId ?? (node as any).placement_id ?? (node as any).placementId ?? (node as any).id ?? (node as any).zone ?? (node as any).value ?? (node as any).key;
        if (v != null) push(v);
        for (const [k, vv] of Object.entries(node)) walk(vv, k);
      }
    };
    walk(json);
    const items = Array.from(ids).slice(0, 100);
    return new Response(JSON.stringify({ ok: true, providerCampaignId: providerCid, total: ids.size, items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: "server_error", message: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
