import { NextRequest } from "next/server";
import OpenAI from "openai";
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

    // Build a messages list from commit first lines
    const messages: string[] = [];
    for (const c of commits) {
      const msg: string = String(c?.message || "").trim();
      if (!msg) continue;
      const firstLine = msg.split(/\r?\n/)[0];
      messages.push(`- ${firstLine}`);
    }

    // Summary-only mode
    let added = 0;
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      let summary: string | null = null;
      if (apiKey && messages.length > 0) {
        const client = new OpenAI({ apiKey });
        const prompt = `Summarize these git commit titles into a short, user-facing release note (2-4 bullets max), combine related items, and keep it concise and non-technical.\n\n${messages.join("\n")}`;
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            { role: "system", content: "You are an assistant that writes concise release notes for product changes." },
            { role: "user", content: prompt },
          ],
        });
        summary = completion.choices?.[0]?.message?.content?.trim() || null;
      }
      if (!summary) {
        // Fallback: simple bullet list
        summary = messages.length ? messages.join("\n") : "Minor internal adjustments.";
      }
      const summaryEntry: Entry = {
        id: crypto.randomUUID(),
        title: `Deployment summary (${commits.length} commit${commits.length===1?"":"s"})`,
        kind: "note",
        content: summary,
        createdAt: new Date().toISOString(),
        author: pusher || undefined,
      };
      await kv.lpush(LIST_KEY, summaryEntry);
      await kv.ltrim(LIST_KEY, 0, 499);
      added = 1;
    } catch {}

    return new Response(JSON.stringify({ ok: true, added }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
