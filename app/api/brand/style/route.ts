import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import OpenAI from "openai";
import { requirePermission } from "@/app/lib/permissions";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const baseUrl = String(body?.baseUrl || body?.url || "");
    if (!baseUrl) return new Response(JSON.stringify({ error: "missing_baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const host = new URL(baseUrl).host;
    const crawl = (await kv.get(`brand:crawl:${host}`)) as any;
    if (!crawl || !Array.isArray(crawl?.pages) || crawl.pages.length === 0) {
      return new Response(JSON.stringify({ error: "no_crawl_data", message: "Run /api/brand/index first." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Aggregate text from top pages (prioritize homepage and marketing pages)
    const pages = crawl.pages as Array<{ url: string; title?: string; text?: string }>;
    const prioritized = pages
      .slice()
      .sort((a, b) => (a.url === crawl.baseUrl ? -1 : b.url === crawl.baseUrl ? 1 : (b.text?.length || 0) - (a.text?.length || 0)))
      .slice(0, 30);
    const corpus = prioritized.map((p) => `URL: ${p.url}\nTITLE: ${p.title || ""}\nTEXT: ${p.text || ""}`).join("\n\n---\n\n");

    const system = `You are a brand stylist. Given raw website copy across many pages, extract a concise brand profile for creative production. Output strict JSON with keys: name, tone, voice, keywords, audience, colors, ctas, dos, donts, summary.
Rules:\n- colors: array of color names or hex if explicitly present\n- tone/voice: short phrases\n- dos/donts: bullet-y short strings\n- ctas: common calls-to-action from the copy\n- keywords: 5-15 brand phrases/terms\n- audience: 1-2 sentences\n- summary: 2-3 sentences, no marketing fluff.`;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: `Website host: ${host}\nBase URL: ${crawl.baseUrl}\n\nCONTENT:\n${corpus}` },
    ];
    const completion = await client.chat.completions.create({ model: "gpt-4.1-mini", temperature: 0.2, messages });
    const content = completion.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return new Response(JSON.stringify({ error: "no_json" }), { status: 500, headers: { "Content-Type": "application/json" } });
    const profile = JSON.parse(jsonMatch[0]);
    const key = `brand:style:${host}`;
    const saved = { host, baseUrl: crawl.baseUrl, profile, ts: new Date().toISOString() };
    await kv.set(key, saved);
    return new Response(JSON.stringify({ ok: true, host, key, profile }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl") || searchParams.get("url") || "";
    const host = baseUrl ? new URL(baseUrl).host : searchParams.get("host");
    if (!host) return new Response(JSON.stringify({ error: "missing host/baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const data = await kv.get(`brand:style:${host}`);
    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
