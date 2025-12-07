import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const KEY = "audit:events";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const items = ((await kv.lrange(KEY, 0, -1)) as any[]) || [];
  const filtered = category && category !== "all" ? items.filter((e) => e?.category === category) : items;
  return new Response(
    JSON.stringify({ items: filtered }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
