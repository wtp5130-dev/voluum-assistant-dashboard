import { NextRequest } from "next/server";
// @ts-ignore kv types may not be available at build
import { kv } from "@vercel/kv";

const GALLERY_KEY = "gallery:images";
const MEDIA_KEY = "media:items";
const MEDIA_SEEN_KEY = "media:seen";
const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Normalize asset URLs for dedupe: strip query, lowercase host, keep path only
function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.host.toLowerCase();
    // Remove query and hash which often contain expiring tokens
    return `${url.protocol}//${host}${url.pathname}`;
  } catch {
    return u;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const taskId = url.searchParams.get("taskId") || url.searchParams.get("task") || "";
    const allow = process.env.IMPORT_TOKEN || process.env.SEED_TOKEN || process.env.NEXT_PUBLIC_SEED_TOKEN || process.env.NEXT_PUBLIC_IMPORT_TOKEN || "";
    // Allow when
    // 1) a matching token is provided, OR
    // 2) the request is same-origin (referer host matches request host). This enables client-side calls without exposing the token.
    if (allow && token && token === allow) {
      // ok
    } else {
      const referer = req.headers.get("referer") || "";
      const reqHost = req.headers.get("host") || url.host || "";
      let refHost = "";
      try { refHost = referer ? new URL(referer).host : ""; } catch {}
      const sameOrigin = !!refHost && refHost === reqHost;
      if (!sameOrigin) return json({ error: "unauthorized" }, 401);
    }
    if (!taskId) return json({ error: "missing taskId" }, 400);

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) return json({ error: "missing CLICKUP_API_KEY" }, 500);

    // Helper: filter out obvious avatars/emojis/icons
    const isAcceptableImageUrl = (u: string) => {
      try {
        const url = new URL(u);
        const path = url.pathname.toLowerCase();
        const host = url.host.toLowerCase();
        const isExt = /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u);
        const isClickUp = /clickup|attachments|clickupusercontent/.test(host);
        const looksLikeAsset = /attachment|image|thumb|uploads?/i.test(path);
        const banned = /avatar|profile-?photos?|emoji|reaction|userpic|gravatar|icons?\//i.test(path);
        const bannedHosts = /(gravatar\.com|githubusercontent\.com)/i.test(host);
        // Allow ClickUp asset links even without classical extensions
        return ((isExt || (isClickUp && looksLikeAsset)) && !banned && !bannedHosts);
      } catch { return false; }
    };

    // Task meta
    const infoRes = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: apiKey },
    });
    const infoTxt = await infoRes.text();
    const info = infoTxt ? JSON.parse(infoTxt) : {};
    const desc = String(info?.description || "");
    const getLine = (label: string) => {
      const m = desc.match(new RegExp(`${label}\\s*:\\s*(.+)`, "i"));
      return m ? m[1].trim() : undefined;
    };
    const brandName = getLine("Brand");
    const outsLine = getLine("Requested Outputs");
    const outputs = outsLine ? outsLine.split(/\s*,\s*/).filter(Boolean) : undefined;

    // First, parse task attachments on the task itself
    const taskAtts: any[] = Array.isArray((info as any)?.attachments) ? (info as any).attachments : [];
    const urls: string[] = [];
    for (const att of taskAtts) {
      const u = att?.url || att?.thumb || att?.image || att?.path || att?.download_url;
      const mime = att?.mime || att?.mimetype || att?.content_type || att?.type;
      const isImg = (typeof mime === 'string' && mime.toLowerCase().startsWith('image/')) || (typeof att?.type === 'string' && att.type.toLowerCase() === 'image');
      if (typeof u === 'string' && (isImg || isAcceptableImageUrl(u))) urls.push(u);
    }
    console.log(`[import] Task ${taskId}: task.attachments found=${taskAtts.length}, extracted=${urls.length}`);

    // Deep scan task JSON for any image-like URLs
    try {
      const deepScan = (root: any): string[] => {
        const out: string[] = [];
        const stack: any[] = [root];
        while (stack.length) {
          const v = stack.pop();
          if (typeof v === 'string') {
            if (isAcceptableImageUrl(v)) out.push(v);
          } else if (Array.isArray(v)) {
            for (const x of v) stack.push(x);
          } else if (v && typeof v === 'object') {
            const u = (v as any).url || (v as any).thumb || (v as any).image || (v as any).path || (v as any).download_url;
            const mime = (v as any).mime || (v as any).mimetype || (v as any).content_type || (v as any).type;
            const isImg = (typeof mime === 'string' && mime.toLowerCase().startsWith('image/')) || (typeof (v as any).type === 'string' && (v as any).type.toLowerCase() === 'image');
            if (typeof u === 'string' && (isImg || isAcceptableImageUrl(u))) out.push(u);
            for (const k of Object.keys(v)) stack.push((v as any)[k]);
          }
        }
        return Array.from(new Set(out));
      };
      const scanUrls = deepScan(info);
      if (scanUrls.length) {
        for (const u of scanUrls) if (!urls.includes(u)) urls.push(u);
      }
      console.log(`[import] Task ${taskId}: deep-scan found ${scanUrls.length} URL(s)`);
    } catch {}

    // Comments (attachments)
    const comRes = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}/comment`, {
      method: "GET",
      headers: { 
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
    });
    const comStatus = comRes.status;
    const comTxt = await comRes.text();
    
    console.log(`[import] Comments request status: ${comStatus}`);
    console.log(`[import] Comments response: ${comTxt.substring(0, 500)}`);
    
    if (!comRes.ok) {
      console.warn(`[import] Failed to fetch comments: ${comStatus} ${comTxt}`);
      return json({ ok: false, taskId, saved: 0, outputs, brandName, error: `Failed to fetch comments: ${comStatus}`, comResponse: comTxt.substring(0, 200) });
    }
    
    const comJson = comTxt ? JSON.parse(comTxt) : {};
    const comments: any[] = Array.isArray(comJson?.comments) ? comJson.comments : (Array.isArray(comJson) ? comJson : []);

    console.log(`[import] Task ${taskId}: found ${comments.length} comments`);
    console.log(`[import] Full comments JSON:`, JSON.stringify(comments, null, 2).substring(0, 3000));

    // Extract image URLs and a bot comment if any (merge into urls)
    let botComment: string | undefined;
    const pushUrl = (u?: string) => { if (typeof u === 'string' && isAcceptableImageUrl(u)) urls.push(u); };
    const extractUrlsFromAny = (v: any) => {
      if (!v) return;
      if (typeof v === 'string') {
        // Pull URLs from plaintext/HTML as fallback
        try {
          const re = /(https?:\/\/[^\s"')]+\.(?:png|jpe?g|webp|gif|svg))(?:\?[^\s"')]*)?/ig;
          let m: RegExpExecArray | null;
          while ((m = re.exec(v)) !== null) pushUrl(m[1]);
        } catch {}
      } else if (Array.isArray(v)) {
        for (const x of v) extractUrlsFromAny(x);
      } else if (typeof v === 'object') {
        const u = (v as any).url || (v as any).thumb || (v as any).image || (v as any).path || (v as any).download_url;
        if (typeof u === 'string') pushUrl(u);
        // sometimes image is nested object with url
        if (v && (v as any).image && typeof (v as any).image === 'object') pushUrl((v as any).image.url);
        for (const k of Object.keys(v)) extractUrlsFromAny((v as any)[k]);
      }
    };

    for (const c of comments) {
      // 1) Comment items (rich text blocks)
      const commentItems = c?.comment || [];
      if (Array.isArray(commentItems)) {
        for (const item of commentItems) {
          // Prefer declared image blocks
          if (item?.type === 'image') {
            if (typeof item?.image === 'string') pushUrl(item.image);
            if (item?.image?.url) pushUrl(item.image.url);
          }
          // Capture text as bot comment once
          if (!botComment && typeof item?.text === 'string' && item.text.trim()) botComment = item.text;
          // Deep-extract any embedded links
          extractUrlsFromAny(item);
        }
      }
      // 2) Comment attachments array
      const atts = Array.isArray(c?.attachments) ? c.attachments : [];
      for (const a of atts) {
        const au = a?.url || a?.thumb || a?.image || a?.path || a?.download_url;
        pushUrl(typeof au === 'string' ? au : undefined);
      }
      // 3) Raw HTML/plaintext body for embedded URLs
      if (typeof c?.comment_text === 'string') extractUrlsFromAny(c.comment_text);
      if (typeof c?.text === 'string') extractUrlsFromAny(c.text);
    }

    console.log(`[import] Task ${taskId}: extracted ${urls.length} URLs`);
    // Build a unique list by normalized URL (keeps first seen original)
    const byNorm = new Map<string, string>();
    for (const u of urls) {
      const k = normalizeUrl(u);
      if (!byNorm.has(k)) byNorm.set(k, u);
    }
    const unique = Array.from(byNorm.values());
    const now = new Date().toISOString();
    let saved = 0;
    for (const u of unique) {
      try {
        const added = await kv.sadd(MEDIA_SEEN_KEY, normalizeUrl(u));
        if (added === 0) continue;
      } catch {}
      const filename = (() => { try { const p = new URL(u).pathname.split("/").pop() || "image"; return decodeURIComponent(p); } catch { return "image"; } })();
      const galleryItem = { id: crypto.randomUUID(), url: u, provider: "clickup", prompt: botComment || "(ClickUp attachment)", brandName, outputs, botComment, comments: [], taskId, status: "open", createdAt: now };
      await kv.lpush(GALLERY_KEY, galleryItem); await kv.ltrim(GALLERY_KEY, 0, 999);
      const mediaItem = { id: crypto.randomUUID(), url: u, filename, createdAt: now };
      await kv.lpush(MEDIA_KEY, mediaItem); await kv.ltrim(MEDIA_KEY, 0, 999);
      saved++;
    }

    return json({ ok: true, taskId, saved, outputs, brandName });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
}
