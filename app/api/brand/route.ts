import { NextRequest } from "next/server";
// @ts-ignore KV types may not be available
import { kv } from "@vercel/kv";

const LIST_KEY = "brand:list";

type Brand = { id: string; name: string };

const DEFAULT_BRANDS: Brand[] = [
  { id: "3Star88", name: "3Star88" },
  { id: "Sol88", name: "Sol88" },
];

export async function GET(): Promise<Response> {
  try {
    const items = (await kv.get<Brand[]>(LIST_KEY)) || DEFAULT_BRANDS;
    return new Response(JSON.stringify({ brands: items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    // Fallback to defaults if KV is unavailable
    return new Response(JSON.stringify({ brands: DEFAULT_BRANDS, note: "fallback" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Optional: allow adding brands with POST (not required by UI, but useful)
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    let list = (await kv.get<Brand[]>(LIST_KEY)) || DEFAULT_BRANDS;
    const id = String(body?.id || body?.name || "").trim();
    const name = String(body?.name || body?.id || "").trim();
    if (!id || !name) return new Response(JSON.stringify({ error: "missing id/name" }), { status: 400, headers: { "Content-Type": "application/json" } });
    if (!list.find((b) => b.id === id)) list = [...list, { id, name }];
    await kv.set(LIST_KEY, list);
    return new Response(JSON.stringify({ ok: true, brands: list }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
