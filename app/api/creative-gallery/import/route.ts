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

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const taskId = url.searchParams.get("taskId") || url.searchParams.get("task") || "";
    const allow = process.env.IMPORT_TOKEN || process.env.SEED_TOKEN || process.env.NEXT_PUBLIC_SEED_TOKEN || "";
    if (!allow || token !== allow) return json({ error: "unauthorized" }, 401);
    if (!taskId) return json({ error: "missing taskId" }, 400);

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) return json({ error: "missing CLICKUP_API_KEY" }, 500);

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

    // Extract image URLs and a bot comment if any
    const urls: string[] = [];
    let botComment: string | undefined;
    for (const c of comments) {
      const attachments = c?.attachments || c?.attachment || [];
      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          const u = att?.url || att?.thumb || att?.image || att?.path;
          if (typeof u === "string" && /(https?:\/\/.*\.(?:png|jpe?g|webp|gif|svg))(\?|$)/i.test(u)) urls.push(u);
        }
      }
      const text = c?.comment_text || c?.text || "";
      if (!botComment && text) botComment = text;
      const matches = (text.match(/https?:\/\/\S+/g) || []).filter((u: string) => /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u));
      urls.push(...matches);
    }

    console.log(`[import] Task ${taskId}: extracted ${urls.length} URLs`);
    const unique = Array.from(new Set(urls));
    const now = new Date().toISOString();
    let saved = 0;
    for (const u of unique) {
      try {
        const added = await kv.sadd(MEDIA_SEEN_KEY, u);
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
