import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl") || searchParams.get("url") || "";
    const host = baseUrl ? new URL(baseUrl).host : searchParams.get("host");
    if (!host) {
      return new Response(JSON.stringify({ error: "missing host/baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const data = await kv.get(`brand:status:${host}`);
    return new Response(JSON.stringify({ ok: true, status: data || null }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl") || searchParams.get("url") || "";
    const host = baseUrl ? new URL(baseUrl).host : searchParams.get("host");
    if (!host) {
      return new Response(JSON.stringify({ error: "missing host/baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    await kv.del(`brand:status:${host}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
