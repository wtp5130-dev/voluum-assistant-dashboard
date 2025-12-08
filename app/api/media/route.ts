import { NextRequest } from "next/server";
// @ts-ignore dynamic import types may not be available
import { kv } from "@vercel/kv";

const LIST_KEY = "media:items";

type MediaItem = {
  id: string;
  url: string;
  filename: string;
  mime?: string;
  size?: number;
  brandId?: string;
  brandName?: string;
  tags?: string[];
  createdAt: string;
};

export async function GET(): Promise<Response> {
  try {
    const items = (await kv.lrange<MediaItem>(LIST_KEY, 0, -1)) || [];
    return new Response(JSON.stringify({ items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "use multipart/form-data" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // @ts-ignore formData on NextRequest
    const form = await (req as any).formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "missing file" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const brandId = form.get("brandId") ? String(form.get("brandId")) : undefined;
    const brandName = form.get("brandName") ? String(form.get("brandName")) : undefined;
    const rawTags = form.get("tags") ? String(form.get("tags")) : "";
    const tags = rawTags ? rawTags.split(/[\s,]+/).filter(Boolean) : undefined;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: "Configure BLOB_READ_WRITE_TOKEN to enable uploads." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const filename = (file as any).name || `upload-${Date.now()}`;
    // Upload to Vercel Blob
    // @ts-ignore allow dynamic import
    const { put } = await import("@vercel/blob");
    const res = await put(filename, file as any, { access: "public", token });

    const item: MediaItem = {
      id: crypto.randomUUID(),
      url: res.url,
      filename,
      mime: (file as any).type || undefined,
      size: (file as any).size || undefined,
      brandId,
      brandName,
      tags,
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
    const items = (await kv.lrange<MediaItem>(LIST_KEY, 0, -1)) || [];
    const filtered = items.filter((x: MediaItem) => x.id !== id);
    await kv.del(LIST_KEY);
    for (let i = filtered.length - 1; i >= 0; i--) await kv.lpush(LIST_KEY, filtered[i]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
