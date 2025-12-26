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
  outputs?: string[];
  botComment?: string;
  comments?: Array<{ id: string; text: string; author?: string; ts: string }>;
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
      outputs: Array.isArray(body?.outputs) ? body.outputs.map((s: any) => String(s)) : (typeof body?.outputs === 'string' ? String(body.outputs).split(/\s*,\s*/).filter(Boolean) : undefined),
      botComment: body?.botComment ? String(body.botComment) : undefined,
      comments: [],
      createdAt: new Date().toISOString(),
    };
    await kv.lpush(LIST_KEY, item);
    await kv.ltrim(LIST_KEY, 0, 999);
    return new Response(JSON.stringify({ ok: true, item }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const items = (await kv.lrange<GalleryItem>(LIST_KEY, 0, -1)) || [];
    const idx = items.findIndex((x: GalleryItem) => x.id === id);
    if (idx < 0) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    const current = items[idx];
    let next: GalleryItem = { ...current } as any;
    if (body?.brandId !== undefined) next.brandId = String(body.brandId || "") || undefined;
    if (body?.brandName !== undefined) next.brandName = String(body.brandName || "") || undefined;
    if (body?.prompt !== undefined) next.prompt = String(body.prompt || "");
    if (body?.size !== undefined) next.size = String(body.size || "") || undefined;
    if (body?.style_preset !== undefined) next.style_preset = String(body.style_preset || "") || undefined;
    if (body?.negative_prompt !== undefined) next.negative_prompt = String(body.negative_prompt || "") || undefined;
    if (body?.outputs !== undefined) next.outputs = Array.isArray(body.outputs) ? body.outputs.map((s: any)=> String(s)) : (typeof body.outputs === 'string' ? String(body.outputs).split(/\s*,\s*/).filter(Boolean) : undefined);
    if (body?.botComment !== undefined) next.botComment = String(body.botComment || "") || undefined;
    if (body?.comment && typeof body.comment === 'object' && body.comment.text) {
      const comm = { id: crypto.randomUUID(), text: String(body.comment.text), author: body.comment.author ? String(body.comment.author) : undefined, ts: new Date().toISOString() };
      next.comments = Array.isArray(next.comments) ? [...next.comments, comm] : [comm];
    }
    const updated = [...items];
    updated[idx] = next;
    await kv.del(LIST_KEY);
    for (let i = updated.length - 1; i >= 0; i--) await kv.lpush(LIST_KEY, updated[i]);
    return new Response(JSON.stringify({ ok: true, item: next }), { status: 200, headers: { "Content-Type": "application/json" } });
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
