import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { requirePermission } from "@/app/lib/permissions";

type Template = {
  id: string;
  name: string;
  brandId?: string;
  brandName?: string;
  fields: any;
  createdAt: string;
};

function keyFor(brandId?: string, brandName?: string) {
  if (brandId) return `prompt:templates:id:${brandId}`;
  if (brandName) return `prompt:templates:name:${brandName.toLowerCase()}`;
  return `prompt:templates:default`;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId") || undefined;
    const brandName = searchParams.get("brandName") || undefined;
    const byId = (await kv.get<Template[]>(keyFor(brandId || undefined, undefined))) || [];
    const byName = (await kv.get<Template[]>(keyFor(undefined, brandName || undefined))) || [];
    const map = new Map<string, Template>();
    [...byId, ...byName].forEach((t) => { if (t && !map.has(t.id)) map.set(t.id, t); });
    const items = Array.from(map.values());
    return new Response(JSON.stringify({ ok: true, items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const brandId = String(body?.brandId || "").trim() || undefined;
    const brandName = String(body?.brandName || "").trim() || undefined;
    const name = String(body?.name || "").trim();
    const fields = body?.fields || {};
    if (!name) return new Response(JSON.stringify({ error: "missing_name" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const listKey = keyFor(brandId, undefined);
    const nameKey = brandName ? keyFor(undefined, brandName) : undefined;
    const item: Template = { id: crypto.randomUUID(), name, brandId, brandName, fields, createdAt: new Date().toISOString() };
    const existing = (await kv.get<Template[]>(listKey)) || [];
    await kv.set(listKey, [item, ...existing].slice(0, 50));
    if (nameKey) {
      const byName = (await kv.get<Template[]>(nameKey)) || [];
      await kv.set(nameKey, [item, ...byName].slice(0, 50));
    }
    return new Response(JSON.stringify({ ok: true, item }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const brandId = String(body?.brandId || "").trim() || undefined;
    const brandName = String(body?.brandName || "").trim() || undefined;
    const id = String(body?.id || "").trim();
    if (!id) return new Response(JSON.stringify({ error: "missing_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const listKey = keyFor(brandId, undefined);
    const existing = (await kv.get<Template[]>(listKey)) || [];
    const filtered = existing.filter((t) => t.id !== id);
    await kv.set(listKey, filtered);
    if (brandName) {
      const nameKey = keyFor(undefined, brandName);
      const byName = (await kv.get<Template[]>(nameKey)) || [];
      const filteredName = byName.filter((t) => t.id !== id);
      await kv.set(nameKey, filteredName);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
