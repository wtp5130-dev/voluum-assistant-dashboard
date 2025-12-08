import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { requirePermission } from "@/app/lib/permissions";

const KEY = "brand:profile";

type BrandProfile = {
  name: string;
  colors: string[]; // hex or names
  style: string; // art style notes
  negative?: string; // avoid words
};

export async function GET(): Promise<Response> {
  try {
    const brand = (await kv.get(KEY)) as BrandProfile | null;
    return new Response(JSON.stringify({ brand: brand || null }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const style = String(body?.style || "").trim();
    const negative = String(body?.negative || "").trim();
    const colorsRaw = Array.isArray(body?.colors) ? body.colors : String(body?.colors || "").split(/[\s,]+/);
    const colors = colorsRaw.map((c: any) => String(c).trim()).filter((c: string) => c.length > 0);
    const brand: BrandProfile = { name, colors, style, negative: negative || undefined };
    await kv.set(KEY, brand);
    return new Response(JSON.stringify({ ok: true, brand }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    await kv.del(KEY);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
