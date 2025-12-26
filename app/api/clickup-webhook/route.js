// Next.js 14 App Router API route (JavaScript)
// POST /api/clickup-webhook
// Receives ClickUp webhook events and logs BannerBot-related updates
import { kv } from '@vercel/kv';

const GALLERY_KEY = 'gallery:images';
const MEDIA_KEY = 'media:items';
const MEDIA_SEEN_KEY = 'media:seen';
const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Some webhook testers issue HEAD/GET pings. Respond 200 to pass connectivity tests.
export async function GET() {
  return new Response(JSON.stringify({ ok: true, ping: true }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: corsHeaders() });
}

export async function POST(request) {
  const headers = { ...corsHeaders(), 'Content-Type': 'application/json' };
  try {
    // Accept empty or non-JSON bodies gracefully to satisfy ClickUp test pings
    let bodyText = '';
    try { bodyText = await request.text(); } catch {}
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

    const event = body?.event || body?.webhook_event || body?.type;
    const taskId = body?.task_id || body?.task?.id || body?.history_items?.[0]?.task?.id;

    if (!event) {
      console.log('[clickup-webhook] Ping/unknown event received');
      return new Response(JSON.stringify({ ok: true, note: 'No event detected' }), { status: 200, headers });
    }

    // Helper: fetch brand/region from task description
    async function fetchTaskMeta(id) {
      try {
        const apiKey = process.env.CLICKUP_API_KEY;
        if (!apiKey || !id) return {};
        const res = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: { Authorization: apiKey },
        });
        const txt = await res.text();
        const json = txt ? JSON.parse(txt) : {};
        const desc = String(json?.description || '');
        const title = String(json?.name || '');
        const getLine = (label) => {
          const m = desc.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'));
          return m ? m[1].trim() : undefined;
        };
        const brandName = getLine('Brand');
        const region = getLine('Region');
        const outsLine = getLine('Requested Outputs');
        const outputs = outsLine ? outsLine.split(/\s*,\s*/).filter(Boolean) : undefined;
        return { brandName, region, title, outputs };
      } catch {
        return {};
      }
    }

    async function persistImages(urls, meta = {}) {
      if (!urls || !urls.length) return;
      const now = new Date().toISOString();
      for (const url of urls) {
        try {
          try { const added = await kv.sadd(MEDIA_SEEN_KEY, url); if (added === 0) continue; } catch {}
          const filename = (() => {
            try { const u = new URL(url); return decodeURIComponent(u.pathname.split('/').pop() || 'image'); } catch { return 'image'; }
          })();
          const galleryItem = { id: crypto.randomUUID(), url, provider: 'clickup', prompt: meta.prompt || meta.botComment || '(ClickUp attachment)', size: meta.size, style_preset: meta.style_preset, negative_prompt: meta.negative_prompt, brandId: meta.brandId, brandName: meta.brandName, outputs: meta.outputs, botComment: meta.botComment, comments: [], taskId: meta.taskId, status: 'open', createdAt: now };
          await kv.lpush(GALLERY_KEY, galleryItem); await kv.ltrim(GALLERY_KEY, 0, 999);
          const mediaItem = { id: crypto.randomUUID(), url, filename, mime: undefined, size: undefined, brandId: meta.brandId, brandName: meta.brandName, tags: undefined, kind: undefined, createdAt: now };
          await kv.lpush(MEDIA_KEY, mediaItem); await kv.ltrim(MEDIA_KEY, 0, 999);
        } catch (e) {
          console.error('[clickup-webhook] persist image failed', e);
        }
      }
    }

    async function fetchTaskCommentImageUrls(taskId) {
      try {
        const apiKey = process.env.CLICKUP_API_KEY;
        if (!apiKey || !taskId) return [];
        const res = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}/comment`, {
          method: 'GET',
          headers: { Authorization: apiKey },
        });
        const txt = await res.text();
        const json = txt ? JSON.parse(txt) : {};
        const comments = Array.isArray(json?.comments) ? json.comments : (Array.isArray(json) ? json : []);
        const urls = [];
        
        for (const c of comments) {
          // ClickUp comments structure: c.comment is an array of objects
          const commentItems = c?.comment || [];
          if (Array.isArray(commentItems)) {
            for (const item of commentItems) {
              // Look for image items: { type: "image", image: { url: "..." } }
              if (item?.type === "image" && item?.image?.url) {
                urls.push(item.image.url);
              }
            }
          }
          
          // Legacy fallback: check for attachments field
          const attachments = c?.attachments || c?.attachment || [];
          if (Array.isArray(attachments)) {
            for (const att of attachments) {
              const u = att?.url || att?.thumb || att?.image || att?.path;
              if (typeof u === 'string' && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u)) urls.push(u);
            }
          }
        }
        return Array.from(new Set(urls));
      } catch (e) {
        console.warn('[clickup-webhook] fetchTaskCommentImageUrls failed', e);
        return [];
      }
    }

    switch (event) {
      case 'taskCommentPosted': {
        const comment = body?.comment || body?.history_items?.[0]?.comment;
        const text = comment?.text || comment?.comment_text || '';
        const attachments = comment?.attachments || comment?.attachment || [];

        // Try to extract image URLs (very defensive parsing)
        const imageUrls = [];
        if (Array.isArray(attachments)) {
          for (const att of attachments) {
            const url = att?.url || att?.thumb || att?.image || att?.path;
            if (typeof url === 'string' && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
              imageUrls.push(url);
            }
          }
        }
        // Also scan text for embedded URLs
        const urlMatches = (text.match(/https?:\/\/\S+/g) || []).filter(u => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));
        imageUrls.push(...urlMatches);

        console.log('[clickup-webhook] taskCommentPosted', {
          taskId,
          textPreview: text?.slice(0, 140),
          imageCount: imageUrls.length,
          imageUrls,
        });

        if (imageUrls.length) {
          const meta = await fetchTaskMeta(taskId);
          await persistImages(imageUrls, { ...meta, botComment: text, taskId });
          console.log('[clickup-webhook] saved images to gallery and media', { count: imageUrls.length });
        }
        break;
      }
      case 'taskAttachmentPosted':
      case 'taskAttachmentCreated':
      case 'taskStatusUpdated': {
        // Deep scan payload for any image-like URLs
        const urls = [];
        try {
          const stack = [body];
          while (stack.length) {
            const v = stack.pop();
            if (typeof v === 'string') {
              if (/^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v)) urls.push(v);
            } else if (Array.isArray(v)) {
              for (const x of v) stack.push(x);
            } else if (v && typeof v === 'object') {
              for (const k of Object.keys(v)) stack.push(v[k]);
            }
          }
        } catch {}
        if (urls.length) {
          const meta = await fetchTaskMeta(taskId);
          await persistImages(urls, { ...meta, taskId });
          console.log('[clickup-webhook] saved images (non-comment event)', { count: urls.length });
        } else {
          // Fallback: pull latest comments and extract attachments
          const fromComments = await fetchTaskCommentImageUrls(taskId);
          if (fromComments.length) {
            const meta = await fetchTaskMeta(taskId);
            await persistImages(fromComments, { ...meta, taskId });
            console.log('[clickup-webhook] saved images from comment fetch', { count: fromComments.length });
          }
        }
        break;
      }
      
      default: {
        // Log other events for visibility during setup
        console.log('[clickup-webhook] event received', { event, taskId });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('[clickup-webhook] Unhandled error', err);
    return new Response(JSON.stringify({ ok: false, error: 'Unhandled server error' }), {
      status: 500,
      headers,
    });
  }
}
