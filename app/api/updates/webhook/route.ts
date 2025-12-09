import { NextRequest } from "next/server";
// @ts-ignore dynamic import types may not be available
import { kv } from "@vercel/kv";

const LIST_KEY = "updates:entries";

type Entry = {
  id: string;
  title: string;
  kind: "feature" | "fix" | "note";
  content: string;
  createdAt: string;
  author?: string;
};

function mapKind(message: string): Entry["kind"] {
  const m = message.toLowerCase();
  if (m.startsWith("feat")) return "feature";
  if (m.startsWith("fix")) return "fix";
  return "note";
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const token = req.headers.get("x-webhook-token") || req.nextUrl.searchParams.get("token");
    const expected = process.env.UPDATES_WEBHOOK_TOKEN || "";
    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const commits: Array<any> = Array.isArray(body?.commits) ? body.commits : [];
    const repo = body?.repository?.full_name || body?.repository?.name || "repo";
    const pusher = body?.pusher?.name || body?.head_commit?.author?.name || undefined;

    if (commits.length === 0) {
      return new Response(JSON.stringify({ ok: true, added: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    let added = 0;
    for (const c of commits) {
      const msg: string = String(c?.message || "").trim();
      if (!msg) continue;
      const firstLine = msg.split(/\r?\n/)[0];
      const entry: Entry = {
        id: crypto.randomUUID(),
        title: firstLine,
        kind: mapKind(firstLine),
        content: `Commit ${c?.id?.slice(0,7) || ""} by ${c?.author?.name || pusher || "unknown"} in ${repo}.\n\n${msg}`,
        createdAt: new Date().toISOString(),
        author: c?.author?.name || pusher || undefined,
      };
      await kv.lpush(LIST_KEY, entry);
      added++;
    }
    await kv.ltrim(LIST_KEY, 0, 499);

    return new Response(JSON.stringify({ ok: true, added }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
