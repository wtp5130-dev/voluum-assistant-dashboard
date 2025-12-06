import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

type Entry = {
  id: string;
  zoneId: string;
  campaignId: string;
  provider?: string;
  reason?: string;
  timestamp: string;
};

export async function GET(): Promise<Response> {
  try {
    const items = (await kv.lrange<Entry>(LIST_KEY, 0, -1)) || [];
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "kv_get_failed", message: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as Partial<Entry> | null;
    if (!body || !body.zoneId || !body.campaignId) {
      return new Response(
        JSON.stringify({ error: "invalid_body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const entry: Entry = {
      id: body.id || crypto.randomUUID(),
      zoneId: String(body.zoneId),
      campaignId: String(body.campaignId),
      provider: body.provider || undefined,
      reason: body.reason || undefined,
      timestamp: body.timestamp || new Date().toISOString(),
    };

    await kv.lpush(LIST_KEY, entry);
    // Optional: cap list to last N
    await kv.ltrim(LIST_KEY, 0, 999);

    return new Response(JSON.stringify({ ok: true, entry }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "kv_post_failed", message: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(): Promise<Response> {
  try {
    await kv.del(LIST_KEY);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "kv_delete_failed", message: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
