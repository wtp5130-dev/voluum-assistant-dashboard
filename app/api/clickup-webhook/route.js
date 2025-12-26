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
      console.log('[clickup-webhook] Ping/unknown event received', {
        bodyKeys: Object.keys(body),
        bodyPreview: JSON.stringify(body)?.slice(0, 300),
        bodyText: bodyText?.slice(0, 200),
      });
      return new Response(JSON.stringify({ ok: true, note: 'No event detected' }), { status: 200, headers });
    }

    console.log('[clickup-webhook] Event received:', { event, taskId, bodyKeys: Object.keys(body) });

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
        if (!res.ok) {
          console.warn('[clickup-webhook] fetchTaskMeta failed:', { status: res.status, taskId: id, response: txt?.slice(0, 200) });
        }
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
        if (!res.ok) {
          console.warn('[clickup-webhook] fetchTaskCommentImageUrls failed:', { status: res.status, taskId, response: txt?.slice(0, 200) });
        }
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
              // Also check if the item itself has a url property (alternative structure)
              if (item?.url && typeof item.url === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item.url)) {
                urls.push(item.url);
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
          
          // Extra fallback: recursively search for image URLs in comment object
          try {
            const stack = [c];
            while (stack.length) {
              const v = stack.pop();
              if (typeof v === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v)) {
                urls.push(v);
              } else if (Array.isArray(v)) {
                for (const x of v) stack.push(x);
              } else if (v && typeof v === 'object') {
                for (const k of Object.keys(v)) stack.push(v[k]);
              }
            }
          } catch {}
        }
        const uniqueUrls = Array.from(new Set(urls));
        console.log('[clickup-webhook] fetchTaskCommentImageUrls extracted:', { taskId, count: uniqueUrls.length, urls: uniqueUrls.slice(0, 3) });
        return uniqueUrls;
      } catch (e) {
        console.warn('[clickup-webhook] fetchTaskCommentImageUrls failed', e);
        return [];
      }
    }

    switch (event) {
      case 'taskCommentPosted': {
        console.log('[clickup-webhook] Handling taskCommentPosted', { taskId });
        const comment = body?.comment || body?.history_items?.[0]?.comment;
        const text = comment?.text || comment?.comment_text || '';
        const attachments = comment?.attachments || comment?.attachment || [];
        
        // Log the comment structure for debugging
        console.log('[clickup-webhook] Comment structure:', { 
          hasComment: !!comment, 
          hasCommentArray: Array.isArray(comment?.comment),
          commentArrayLength: Array.isArray(comment?.comment) ? comment.comment.length : 0,
          commentKeys: comment ? Object.keys(comment) : [],
          textPreview: text?.slice(0, 100)
        });

        // Try to extract image URLs (very defensive parsing)
        const imageUrls = [];
        
        // Check attachments field
        if (Array.isArray(attachments)) {
          for (const att of attachments) {
            const url = att?.url || att?.thumb || att?.image || att?.path;
            if (typeof url === 'string' && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
              imageUrls.push(url);
            }
          }
        }
        
        // Check comment array for image objects
        if (Array.isArray(comment?.comment)) {
          for (const item of comment.comment) {
            if (item?.type === 'image' && item?.image?.url) {
              imageUrls.push(item.image.url);
            }
            if (item?.url && typeof item.url === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(item.url)) {
              imageUrls.push(item.url);
            }
          }
        }
        
        // Also scan text for embedded URLs
        const urlMatches = (text.match(/https?:\/\/\S+/g) || []).filter(u => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));
        imageUrls.push(...urlMatches);

        console.log('[clickup-webhook] taskCommentPosted extracted URLs:', {
          taskId,
          textPreview: text?.slice(0, 140),
          imageCount: imageUrls.length,
          imageUrls,
        });

        if (imageUrls.length) {
          const meta = await fetchTaskMeta(taskId);
          await persistImages(imageUrls, { ...meta, botComment: text, taskId });
          console.log('[clickup-webhook] saved images to gallery and media', { count: imageUrls.length });
        } else {
          console.log('[clickup-webhook] taskCommentPosted: no images in direct parse', {
            taskId,
            hasComment: !!comment,
            commentKeys: comment ? Object.keys(comment) : [],
            hasCommentArray: Array.isArray(comment?.comment),
            commentArrayLength: Array.isArray(comment?.comment) ? comment.comment.length : 0,
            commentArrayPreview: Array.isArray(comment?.comment) ? JSON.stringify(comment.comment.slice(0, 2)) : 'N/A',
            attachmentsLength: (comment?.attachments || []).length,
            textLength: text?.length,
          });
        }
        break;
      }
      case 'taskAttachmentPosted':
      case 'taskAttachmentCreated':
      case 'taskStatusUpdated': {
        console.log('[clickup-webhook] Handling attachment/status event:', { event, taskId });
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
        console.log('[clickup-webhook] Deep scan found URLs:', { event, taskId, count: urls.length });
        if (urls.length) {
          const meta = await fetchTaskMeta(taskId);
          await persistImages(urls, { ...meta, taskId });
          console.log('[clickup-webhook] saved images (non-comment event)', { count: urls.length });
        } else {
          // Fallback: pull latest comments and extract attachments
          console.log('[clickup-webhook] No URLs in deep scan, trying comment fallback...', { taskId });
          const fromComments = await fetchTaskCommentImageUrls(taskId);
          console.log('[clickup-webhook] Comment fallback found URLs:', { taskId, count: fromComments.length, urls: fromComments.slice(0, 2) });
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
        console.log('[clickup-webhook] event received (unhandled type)', { event, taskId });
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
