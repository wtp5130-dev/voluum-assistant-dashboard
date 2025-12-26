import { NextRequest } from "next/server";
// @ts-ignore types may not be available at build time
import { kv } from "@vercel/kv";

const LIST_KEY = "gallery:images";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const urlObj = new URL(req.url);
    const token = urlObj.searchParams.get("token") || "";
    const expected = process.env.SEED_TOKEN || process.env.NEXT_PUBLIC_SEED_TOKEN || "";
    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const img = urlObj.searchParams.get("url") || "https://placehold.co/1200x628/png?text=Sidekick+Test";
    const brandName = urlObj.searchParams.get("brand") || "3Star88";
    const outputs = (urlObj.searchParams.get("outputs") || "Facebook / Instagram Post (1080x1080), Website Banner (1920x1080)")
      .split(/\s*,\s*/)
      .filter(Boolean);

    const item = {
      id: crypto.randomUUID(),
      url: img,
      provider: "seed",
      prompt: "Seed test image",
      brandName,
      outputs,
      comments: [],
      status: "open",
      createdAt: new Date().toISOString(),
    };
    await kv.lpush(LIST_KEY, item);
    await kv.ltrim(LIST_KEY, 0, 999);
    return new Response(JSON.stringify({ ok: true, item }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
