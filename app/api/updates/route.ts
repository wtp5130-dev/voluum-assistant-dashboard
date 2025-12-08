import { NextRequest } from "next/server";
// @ts-ignore dynamic import in runtime
import { kv } from "@vercel/kv";
import { getCurrentUser } from "@/app/lib/permissions";

const LIST_KEY = "updates:entries";

type Entry = {
  id: string;
  title: string;
  kind: "feature" | "fix" | "note";
  content: string;
  createdAt: string;
  author?: string;
};

export async function GET(): Promise<Response> {
  try {
    const items = (await kv.lrange<Entry>(LIST_KEY, 0, -1)) || [];
    return new Response(JSON.stringify({ items }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();
    const content = String(body?.content || "").trim();
    const kind = (String(body?.kind || "feature").toLowerCase()) as Entry["kind"];
    if (!title || !content || (kind !== "feature" && kind !== "fix" && kind !== "note")) {
      return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const entry: Entry = {
      id: crypto.randomUUID(),
      title,
      content,
      kind,
      createdAt: new Date().toISOString(),
      author: user.username,
    };
    await kv.lpush(LIST_KEY, entry);
    await kv.ltrim(LIST_KEY, 0, 499);
    return new Response(JSON.stringify({ ok: true, entry }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const clearAll = Boolean(body?.all);

    if (clearAll) {
      await kv.del(LIST_KEY);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!id) {
      return new Response(JSON.stringify({ error: "missing_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const items = (await kv.lrange<Entry>(LIST_KEY, 0, -1)) || [];
    const filtered = items.filter((e: Entry) => e.id !== id);
    // Rewrite list preserving order
    await kv.del(LIST_KEY);
    for (let i = filtered.length - 1; i >= 0; i--) {
      await kv.lpush(LIST_KEY, filtered[i]);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
