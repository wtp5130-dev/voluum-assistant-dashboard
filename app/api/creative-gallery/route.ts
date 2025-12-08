import { NextRequest } from "next/server";
// @ts-ignore types may not be available at build time
import { kv } from "@vercel/kv";

const LIST_KEY = "gallery:images";

export type GalleryItem = {
  id: string;
  url: string;
  provider: string;
  prompt: string;
  size?: string;
  style_preset?: string;
  negative_prompt?: string;
  seed?: string;
  brandId?: string;
  brandName?: string;
  createdAt: string;
};

export async function GET(): Promise<Response> {
  try {
    const items = (await kv.lrange<GalleryItem>(LIST_KEY, 0, -1)) || [];
    return new Response(JSON.stringify({ items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "");
    const provider = String(body?.provider || "");
    const prompt = String(body?.prompt || "");
    if (!url || !provider) return new Response(JSON.stringify({ error: "missing url/provider" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const item: GalleryItem = {
      id: crypto.randomUUID(),
      url,
      provider,
      prompt,
      size: body?.size ? String(body.size) : undefined,
      style_preset: body?.style_preset ? String(body.style_preset) : undefined,
      negative_prompt: body?.negative_prompt ? String(body.negative_prompt) : undefined,
      seed: body?.seed ? String(body.seed) : undefined,
      brandId: body?.brandId ? String(body.brandId) : undefined,
      brandName: body?.brandName ? String(body.brandName) : undefined,
      createdAt: new Date().toISOString(),
    };
    await kv.lpush(LIST_KEY, item);
    await kv.ltrim(LIST_KEY, 0, 999);
    return new Response(JSON.stringify({ ok: true, item }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const items = (await kv.lrange<GalleryItem>(LIST_KEY, 0, -1)) || [];
    const filtered = items.filter((x: GalleryItem) => x.id !== id);
    await kv.del(LIST_KEY);
    for (let i = filtered.length - 1; i >= 0; i--) await kv.lpush(LIST_KEY, filtered[i]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
