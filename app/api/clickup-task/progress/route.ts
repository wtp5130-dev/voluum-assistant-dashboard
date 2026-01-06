import { NextRequest } from "next/server";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get("task") || url.searchParams.get("taskId") || "";
    if (!taskId) return json({ error: "missing task" }, 400);

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) return json({ error: "missing CLICKUP_API_KEY" }, 500);

    // Fetch task meta (attachments, description)
    const tRes = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: apiKey },
      cache: "no-store",
    });
    const tText = await tRes.text();
    const task = tText ? JSON.parse(tText) : {};

    // Fetch comments
    const cRes = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}/comment`, {
      method: "GET",
      headers: { Authorization: apiKey },
      cache: "no-store",
    });
    const cText = await cRes.text();
    const cJson = cText ? JSON.parse(cText) : {};
    const comments: any[] = Array.isArray(cJson?.comments) ? cJson.comments : (Array.isArray(cJson) ? cJson : []);

    // Analyze steps heuristically
    const textBlobs: string[] = [];
    for (const c of comments) {
      const txt = c?.comment?.text || c?.comment_text || c?.text || "";
      if (typeof txt === "string" && txt.trim()) textBlobs.push(txt.toLowerCase());
      if (Array.isArray(c?.comment)) {
        for (const item of c.comment) {
          if (item?.text) textBlobs.push(String(item.text).toLowerCase());
        }
      }
    }

    const hasTodo = textBlobs.some((s) => s.includes("to-do") || s.includes("todo"));
    const hasLoadAssets = textBlobs.some((s) => s.includes("load assets") || s.includes("load objects"));
    const hasGenerating = textBlobs.some((s) => s.includes("generat"));
    const hasUpscale = textBlobs.some((s) => s.includes("upscal") || s.includes("upload"));

    // Detect image presence from task attachments as an additional indicator
    const attachments: any[] = Array.isArray(task?.attachments) ? task.attachments : [];
    const imagesOnTask = attachments.filter((a: any) => {
      const mime = a?.mime || a?.mimetype || a?.content_type || a?.type;
      const url = a?.url || a?.thumb || a?.image || a?.path || a?.download_url;
      const isImg = (typeof mime === "string" && mime.toLowerCase().startsWith("image/")) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(String(url || ""));
      return isImg;
    }).length;

    let percent = 5;
    let label = "Queued";
    if (comments.length > 0) { percent = 15; label = "Agent started"; }
    if (hasTodo) { percent = 30; label = "Writing to-do list"; }
    if (hasLoadAssets) { percent = 50; label = "Loading assets"; }
    if (hasGenerating) { percent = 70; label = "Generating"; }
    if (hasUpscale) { percent = 85; label = "Upscaling & preparing"; }
    if (imagesOnTask > 0) { percent = Math.max(percent, 90); label = "Uploading"; }

    return json({ ok: true, percent, label, comments: comments.length, imagesOnTask });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
}
