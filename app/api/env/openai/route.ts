import { NextRequest } from "next/server";

export async function GET(_req: NextRequest): Promise<Response> {
  try {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length > 0);
    const model = process.env.OPENAI_VISION_MODEL || null;
    return new Response(JSON.stringify({ ok: true, hasOpenAI, model }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
