import { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("u") || searchParams.get("url");
    if (!url) return new Response("missing url", { status: 400 });
    const res = await fetch(url, {
      // Some CDNs require a UA
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SidekickBot/1.0)" },
      // Avoid sending cookies
      cache: "no-store",
    });
    if (!res.ok) {
      return new Response("", { status: 404 });
    }
    // Stream through content type
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuf = await res.arrayBuffer();
    return new Response(Buffer.from(arrayBuf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Disable caching to ensure latest image versions are shown in Gallery
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "proxy error", { status: 500 });
  }
}
