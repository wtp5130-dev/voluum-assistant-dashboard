import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { requirePermission } from "@/app/lib/permissions";

const LIST_KEY = "brand:profiles";
const LEGACY_KEY = "brand:profile"; // single profile (legacy)

type BrandProfile = {
  id: string;
  name: string;
  colors: string[]; // hex or names
  style: string; // art style notes
  negative?: string; // avoid words
};

async function loadProfiles(): Promise<BrandProfile[]> {
  const list = (await kv.get(LIST_KEY)) as BrandProfile[] | null;
  if (Array.isArray(list)) return list;
  // Migrate legacy single
  const legacy = (await kv.get(LEGACY_KEY)) as any;
  if (legacy && typeof legacy === "object") {
    const migrated: BrandProfile = {
      id: crypto.randomUUID(),
      name: String(legacy.name || "Brand"),
      colors: Array.isArray(legacy.colors) ? legacy.colors : [],
      style: String(legacy.style || ""),
      negative: legacy.negative ? String(legacy.negative) : undefined,
    };
    await kv.set(LIST_KEY, [migrated]);
    await kv.del(LEGACY_KEY).catch(() => {});
    return [migrated];
  }
  return [];
}

async function saveProfiles(items: BrandProfile[]): Promise<void> {
  await kv.set(LIST_KEY, items);
}

export async function GET(): Promise<Response> {
  try {
    const brands = await loadProfiles();
    return new Response(JSON.stringify({ brands }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const name = String(body?.name || "").trim();
    const style = String(body?.style || "").trim();
    const negative = String(body?.negative || "").trim();
    const colorsRaw = Array.isArray(body?.colors) ? body.colors : String(body?.colors || "").split(/[\s,]+/);
    const colors = colorsRaw.map((c: any) => String(c).trim()).filter((c: string) => c.length > 0);

    let items = await loadProfiles();
    let brand: BrandProfile | null = null;
    if (id) {
      const idx = items.findIndex((b) => b.id === id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], name, colors, style, negative: negative || undefined };
        brand = items[idx];
      }
    }
    if (!brand) {
      brand = { id: crypto.randomUUID(), name, colors, style, negative: negative || undefined };
      items = [...items, brand];
    }

    await saveProfiles(items);
    return new Response(JSON.stringify({ ok: true, brand }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return new Response(JSON.stringify({ error: "missing_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const items = (await loadProfiles()).filter((b) => b.id !== id);
    await saveProfiles(items);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
