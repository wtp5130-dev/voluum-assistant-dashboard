import { NextRequest } from "next/server";
// @ts-ignore dynamic types may not be available
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get("baseUrl") || searchParams.get("url") || "";
  const host = baseUrl ? new URL(baseUrl).host : searchParams.get("host");
  if (!host) {
    return new Response("missing host/baseUrl", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let closed = false;
      const interval = setInterval(async () => {
        try {
          const data = await kv.get(`brand:status:${host}`);
          send({ status: data || null });
          const p = (data as any)?.progress || 0;
          if (p >= 100) {
            clearInterval(interval);
            closed = true;
            controller.close();
          }
        } catch {}
      }, 1000);
      // heartbeat
      const hb = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: hb\n\n`));
      }, 15000);
      // close after 10 minutes max
      const timeout = setTimeout(() => {
        clearInterval(interval); clearInterval(hb);
        if (!closed) controller.close();
      }, 10 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
