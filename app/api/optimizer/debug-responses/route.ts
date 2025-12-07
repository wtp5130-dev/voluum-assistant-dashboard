import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_campaignId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = `debug:propeller:responses:${campaignId}`;
    const value = await kv.get(key);

    return new Response(JSON.stringify({ ok: true, key, value: value ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
