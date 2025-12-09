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

    // Gather image shortlist (from crawl-level list or from pages)
    const imageList: string[] = Array.isArray(crawl?.images) ? crawl.images.slice(0, 24) : [];

    const system = `You are a brand stylist. Given website copy AND a shortlist of image/banners, extract a brand profile optimized for ad creative production. Prioritize COLORS (from images), NEGATIVE/AVOID list (from both visuals and copy), and STYLE NOTES (succinct art direction).
Output strict JSON with keys exactly: { name, tone, voice, audience, colors, ctas, dos, donts, styleNotes, summary }.
Rules:\n- colors: 5-8 entries (array), prefer hex if obvious from images, else common color names\n- styleNotes: 3-6 bullet-like short lines describing visual style (composition, lighting, textures, typography) inferred from the images\n- dos/donts: short imperative phrases for what to emphasize vs avoid (e.g., "High contrast UI", "No watermarks")\n- ctas: 3-6 brand-appropriate calls-to-action\n- tone/voice: short phrases\n- audience: 1-2 sentences\n- summary: 1 short paragraph, no fluff\n- Do NOT include a 'keywords' field.`;

    // Build multimodal message: text + images
    const userParts: any[] = [
      { type: "text", text: `Website host: ${host}\nBase URL: ${crawl.baseUrl}\n\nCONTENT:\n${corpus}` },
    ];
    for (const url of imageList) {
      userParts.push({ type: "input_image", image_url: url });
    }
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: userParts as any },
    ];
    // Use a vision-capable lightweight model
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({ model, temperature: 0.2, messages });
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
