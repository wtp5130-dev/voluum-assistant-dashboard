import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import OpenAI from "openai";

const LIST_KEY = "updates:entries";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyGitHubSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured; accept
  try {
    const sigHeader = req.headers.get("x-hub-signature-256") || "";
    if (!sigHeader.startsWith("sha256=")) return false;
    const signature = sigHeader.slice(7);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const macBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const macHex = Array.from(new Uint8Array(macBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return timingSafeEqual(macHex, signature);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const event = req.headers.get("x-github-event") || "";
    const raw = await req.text();
    if (!(await verifyGitHubSignature(req, raw))) {
      return new NextResponse(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    if (event !== "push") {
      // ignore other events
      return NextResponse.json({ ok: true, ignored: true });
    }

    const repo = payload?.repository?.full_name || "";
    const pusher = payload?.pusher?.name || payload?.sender?.login || "unknown";
    const commits: any[] = Array.isArray(payload?.commits) ? payload.commits : [];
    if (!commits.length) {
      return NextResponse.json({ ok: true, added: 0 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini";
    const client = apiKey ? new OpenAI({ apiKey }) : null;

    // Build entries from commits with a short conversation-style summary in Details
    const entries = await Promise.all(
      commits.map(async (c: any) => {
        const message: string = String(c?.message || "").trim();
        const firstLine = message.split(/\r?\n/)[0];
        const lower = (firstLine || "").toLowerCase();
        let kind: "feature" | "fix" | "note" = "note";
        if (lower.startsWith("feat") || lower.startsWith("feature")) kind = "feature";
        else if (lower.startsWith("fix") || lower.startsWith("bug")) kind = "fix";
        const url = c?.url || c?.html_url || "";

        // Default details metadata (fallback)
        const meta = [
          url ? `Commit: ${url}` : null,
          repo ? `Repo: ${repo}` : null,
          c?.id ? `SHA: ${String(c.id).slice(0, 7)}` : null,
          c?.author?.name ? `Author: ${c.author.name}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        // Try to generate a short, user-facing summary
        let summary: string | null = null;
        if (client) {
          try {
            const files = ([] as string[])
              .concat(Array.isArray(c?.added) ? c.added : [])
              .concat(Array.isArray(c?.modified) ? c.modified : [])
              .concat(Array.isArray(c?.removed) ? c.removed : []);
            const prompt = [
              "Summarize this git commit for non-technical release notes.",
              "- 1-3 concise bullets max",
              "- combine related changes",
              "- avoid code-level jargon",
              "",
              `Title: ${firstLine || "(no title)"}`,
              files.length ? `Changed files: ${files.slice(0, 15).join(", ")}${files.length > 15 ? ", ..." : ""}` : "",
              message && message !== firstLine ? `\nFull message:\n${message}` : "",
            ]
              .filter(Boolean)
              .join("\n");
            const completion = await client.chat.completions.create({
              model,
              temperature: 0.3,
              messages: [
                { role: "system", content: "You write concise, user-facing release notes from commit context." },
                { role: "user", content: prompt },
              ],
            });
            summary = completion.choices?.[0]?.message?.content?.trim() || null;
          } catch {}
        }

        const details = summary ? `${summary}\n\n${meta}`.trim() : meta || message;

        return {
          id: crypto.randomUUID(),
          title: firstLine || "Commit",
          kind,
          content: details,
          createdAt: c?.timestamp || new Date().toISOString(),
          author: pusher,
        } as const;
      })
    );

    // Push to KV newest-first (lpush each), then cap the list
    for (let i = entries.length - 1; i >= 0; i--) {
      await kv.lpush(LIST_KEY, entries[i]);
    }
    await kv.ltrim(LIST_KEY, 0, 499);

    return NextResponse.json({ ok: true, added: entries.length });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, message: "POST GitHub push webhooks here. Configure secret GITHUB_WEBHOOK_SECRET (optional)." });
}
