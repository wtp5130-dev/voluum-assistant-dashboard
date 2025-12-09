import { NextRequest, NextResponse } from "next/server";
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

function getToken(req: NextRequest): string | null {
  return (
    req.headers.get("x-webhook-token") || req.nextUrl.searchParams.get("token") || null
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const token = getToken(req);
    const expected = process.env.UPDATES_WEBHOOK_TOKEN || process.env.VERCEL_WEBHOOK_TOKEN || "";
    if (!expected || token !== expected) {
      return new NextResponse(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}

    // Common Vercel deployment fields
    const id = body?.id || body?.payload?.deploymentId || body?.deployment?.id;
    const url = body?.url || body?.deployment?.url || body?.payload?.url;
    const name = body?.name || body?.project?.name || body?.deployment?.name || "app";
    const target = body?.target || body?.deployment?.target || body?.environment || "preview";
    const state = body?.state || body?.readyState || body?.type || "event";
    const creator = body?.creator?.username || body?.user?.username || body?.user?.name || body?.payload?.user?.username;

    const meta = body?.meta || body?.deployment?.meta || {};
    const sha = meta.githubCommitSha || meta.GITHUB_COMMIT_SHA || meta.commitSha || meta.commit || null;
    const commitMsg = meta.githubCommitMessage || meta.commitMessage || null;
    const commitAuthor = meta.githubCommitAuthorName || meta.commitAuthor || null;

    let title = "Vercel deployment";
    if (String(state).toLowerCase().includes("ready") || state === "READY") {
      title = `Deployment ready (${target})`;
    } else if (String(state).toLowerCase().includes("error") || state === "ERROR") {
      title = `Deployment failed (${target})`;
    } else if (String(state).toLowerCase().includes("created")) {
      title = `Deployment created (${target})`;
    } else {
      title = `Deployment ${state} (${target})`;
    }

    const lines: string[] = [
      name ? `Project: ${name}` : null,
      url ? `URL: https://${url}`.replace("https://https://", "https://") : null,
      sha ? `Commit: ${sha.slice(0, 7)}` : null,
      commitMsg ? `Message: ${commitMsg}` : null,
      commitAuthor ? `Author: ${commitAuthor}` : null,
      id ? `ID: ${id}` : null,
    ].filter(Boolean) as string[];

    const entry: Entry = {
      id: crypto.randomUUID(),
      title,
      kind: "note",
      content: lines.join("\n"),
      createdAt: new Date().toISOString(),
      author: creator || undefined,
    };

    await kv.lpush(LIST_KEY, entry);
    await kv.ltrim(LIST_KEY, 0, 499);
    return NextResponse.json({ ok: true, added: 1 });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, message: "POST Vercel deployment webhooks here using header x-webhook-token or ?token=..." });
}
