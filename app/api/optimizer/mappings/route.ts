import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const MAPPING_KEY = "mapping:dashboardToProvider";

export async function GET() {
  try {
    const map = (await kv.get(MAPPING_KEY)) as Record<string, string> | null;
    return new Response(JSON.stringify({ ok: true, mapping: map || {} }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dashboardId = body?.dashboardId || body?.key;
    const providerId = body?.providerId || body?.value;
    const dashboardName = body?.dashboardName;
    if (!dashboardId || !providerId) {
      return new Response(JSON.stringify({ ok: false, error: "missing dashboardId or providerId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const existing = (await kv.get(MAPPING_KEY)) as Record<string, string> | null;
    const map = existing || {};
    map[dashboardId] = String(providerId);
    if (dashboardName) map[dashboardName] = String(providerId);
    await kv.set(MAPPING_KEY, map);
    return new Response(JSON.stringify({ ok: true, mapping: map }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dashboardId = body?.dashboardId || body?.key;
    if (!dashboardId) {
      return new Response(JSON.stringify({ ok: false, error: "missing dashboardId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const existing = (await kv.get(MAPPING_KEY)) as Record<string, string> | null;
    const map = existing || {};
    if (map[dashboardId]) delete map[dashboardId];
    await kv.set(MAPPING_KEY, map);
    return new Response(JSON.stringify({ ok: true, mapping: map }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
