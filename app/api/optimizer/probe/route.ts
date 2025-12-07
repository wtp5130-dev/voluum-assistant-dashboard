import { NextRequest } from "next/server";

function buildProviderUrl(campaignId: string) {
  let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  const pathTmpl = process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(campaignId));
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${baseUrl}${path}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) return new Response(JSON.stringify({ ok: false, error: "missing campaignId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const token = process.env.PROPELLER_API_TOKEN;
    if (!token) return new Response(JSON.stringify({ ok: false, error: "missing PROPELLER_API_TOKEN" }), { status: 500, headers: { "Content-Type": "application/json" } });

    const url = buildProviderUrl(campaignId);
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const status = res.status;
    const txt = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = txt ? JSON.parse(txt) : null; } catch { parsed = null; }
    // limit text size to avoid huge responses
    const snippet = typeof txt === "string" ? txt.slice(0, 16_384) : txt;
    return new Response(JSON.stringify({ ok: true, url, status, snippet, parsed }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
