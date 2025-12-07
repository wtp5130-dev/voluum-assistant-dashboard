import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const KEY = "audit:events";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    const entry = body && typeof body === "object" ? body : null;
    if (!entry || !entry.category || !entry.action) {
      return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const withMeta = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      ...entry,
    };
    await kv.lpush(KEY, withMeta);
    await kv.ltrim(KEY, 0, 999);
    return new Response(JSON.stringify({ ok: true, entry: withMeta }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "audit_log_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
