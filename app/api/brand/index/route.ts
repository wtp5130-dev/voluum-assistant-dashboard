import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { requirePermission } from "@/app/lib/permissions";

type CrawlResult = {
  url: string;
  status: number | null;
  title?: string;
  text?: string;
  contentType?: string | null;
  images?: string[];
};

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractLinks(html: string, base: string): string[] {
  const out: string[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    try {
      const abs = new URL(href, base).toString();
      out.push(abs);
    } catch {}
  }
  return out;
}

function extractImageUrls(html: string, base: string): string[] {
  const out: string[] = [];
  // <img src="...">
  const imgRe = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const src = m[1];
    try { out.push(new URL(src, base).toString()); } catch {}
  }
  // og:image
  const ogRe = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/gi;
  while ((m = ogRe.exec(html))) {
    const src = m[1];
    try { out.push(new URL(src, base).toString()); } catch {}
  }
  // link rel=image_src
  const linkRe = /<link\s+rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(html))) {
    const src = m[1];
    try { out.push(new URL(src, base).toString()); } catch {}
  }
  // de-duplicate
  return Array.from(new Set(out));
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return m[1].trim();
  return undefined;
}

function extractText(html: string): string {
  // strip scripts/styles
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  // replace tags with spaces
  s = s.replace(/<[^>]+>/g, " ");
  // collapse whitespace
  s = s.replace(/[\t\r\n ]+/g, " ").trim();
  return s.slice(0, 20000); // cap per page
}

async function fetchSitemap(base: string): Promise<string[]> {
  const urls: string[] = [];
  const candidates = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
  ];
  for (const p of candidates) {
    try {
      const res = await fetch(new URL(p, base));
      if (!res.ok) continue;
      const txt = await res.text();
      // naive XML URL extraction
      const re = /<loc>([^<]+)<\/loc>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const u = normalizeUrl(m[1]);
        if (u) urls.push(u);
      }
      if (urls.length) break;
    } catch {}
  }
  return urls;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const baseUrlRaw = String(body?.baseUrl || body?.url || "");
    const maxPages = Math.min(Number(body?.maxPages || 200), 1000);
    const baseUrl = normalizeUrl(baseUrlRaw || "");
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "invalid_baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const origin = new URL(baseUrl).origin;
    const host = new URL(baseUrl).host;

    // seed set
    try { await kv.set(`brand:status:${host}`, { step: "starting", progress: 5, ts: new Date().toISOString() }); } catch {}
    const seeded = new Set<string>();
    const sitemapUrls = await fetchSitemap(origin).catch(() => []);
    for (const u of sitemapUrls) if (new URL(u).origin === origin) seeded.add(u);
    seeded.add(baseUrl);

    const queue: string[] = Array.from(seeded);
    const seen = new Set<string>();
    const pages: CrawlResult[] = [];

    const collectedImages: string[] = [];
    const MAX_IMAGES = 60;
    while (queue.length && pages.length < maxPages) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      let status: number | null = null;
      try {
        const res = await fetch(next, { headers: { "User-Agent": "VoluumAssistantBot/1.0" } });
        status = res.status;
        // Guard: if the very first request redirects to another host, stop with an explicit error
        const finalOrigin = (()=>{ try { return new URL(res.url).origin; } catch { return null; } })();
        if (next === baseUrl && finalOrigin && finalOrigin !== origin) {
          try { await kv.set(`brand:status:${host}`, { step: "error", progress: 0, ts: new Date().toISOString(), reason: "redirect_other_host", finalUrl: res.url }); } catch {}
          return new Response(
            JSON.stringify({ error: "redirect_other_host", message: `Base URL redirected to a different host: ${res.url}`, finalUrl: res.url }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text/html")) {
          pages.push({ url: next, status, contentType: ct });
          continue;
        }
        const html = await res.text();
        const title = extractTitle(html);
        const text = extractText(html);
        const imgs = extractImageUrls(html, next);
        // Accumulate a limited set of images across the crawl (prefer earlier pages)
        for (const img of imgs) {
          if (collectedImages.length >= MAX_IMAGES) break;
          collectedImages.push(img);
        }
        pages.push({ url: next, status, contentType: ct, title, text, images: imgs });
        // enqueue links from same origin
        for (const href of extractLinks(html, next)) {
          const nu = normalizeUrl(href);
          if (!nu) continue;
          if (new URL(nu).origin !== origin) continue;
          if (!seen.has(nu)) queue.push(nu);
        }
      } catch {
        pages.push({ url: next, status: status });
      }
      // update progress up to 50% during crawl
      try {
        const progress = Math.min(50, Math.floor((pages.length / Math.max(1, maxPages)) * 50));
        await kv.set(`brand:status:${host}`, { step: "crawling", progress, pages: pages.length, ts: new Date().toISOString() });
      } catch {}
    }

    const key = `brand:crawl:${host}`;
    // Provide top-level image shortlist for downstream analysis (unique, capped)
    const allImages = Array.from(new Set(pages.flatMap(p => p.images || []))).slice(0, 60);
    const snapshot = { host, origin, baseUrl, pages, images: allImages, ts: new Date().toISOString() };
    await kv.set(key, snapshot);
    try { await kv.set(`brand:status:${host}`, { step: "crawl_complete", progress: 60, pages: pages.length, ts: new Date().toISOString() }); } catch {}

    return new Response(
      JSON.stringify({ ok: true, host, pagesIndexed: pages.length, fromSitemap: sitemapUrls.length, key }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("baseUrl") || searchParams.get("url") || "";
    const host = url ? new URL(url).host : searchParams.get("host");
    if (!host) return new Response(JSON.stringify({ error: "missing host/baseUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const data = await kv.get(`brand:crawl:${host}`);
    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
