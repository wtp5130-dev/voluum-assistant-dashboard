import { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const token = process.env.PROPELLER_API_TOKEN;
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_token", message: "PROPELLER_API_TOKEN is not set" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    let path = process.env.PROPELLER_LIST_CAMPAIGNS_PATH || "/v5/adv/campaigns";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
      path = path.replace(/^\/v\d+/, "");
    }
    if (!path.startsWith("/")) path = `/${path}`;
    const url = `${baseUrl}${path}`;

    // Try a few common paging params; keep it simple, first page only
    const res = await fetch(q ? `${url}?search=${encodeURIComponent(q)}` : url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `provider_${res.status}`, message: text?.slice(0, 400) || "" }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const raw: any[] = (json?.data || json?.items || json?.campaigns || json || []) as any[];
    const items = Array.isArray(raw)
      ? raw.map((c: any) => ({ id: String(c?.id ?? c?.campaign_id ?? c?.campaignId ?? ""), name: String(c?.name ?? c?.title ?? "Campaign"), status: c?.status ?? undefined }))
      : [];
    return new Response(JSON.stringify({ ok: true, items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message: e?.message || String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
