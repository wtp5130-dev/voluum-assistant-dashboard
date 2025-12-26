// Next.js 14 App Router API route (JavaScript)
// POST /api/clickup-webhook
// Receives ClickUp webhook events and logs BannerBot-related updates
import { kv } from '@vercel/kv';

const GALLERY_KEY = 'gallery:images';
const MEDIA_KEY = 'media:items';

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

        // Persist images to Creative Gallery and Media Library
        if (imageUrls.length) {
          try {
            const now = new Date().toISOString();
            // Save to gallery
            for (const url of imageUrls) {
              const galleryItem = {
                id: crypto.randomUUID(),
                url,
                provider: 'clickup',
                prompt: text || '(ClickUp attachment)',
                createdAt: now,
              };
              await kv.lpush(GALLERY_KEY, galleryItem);
              await kv.ltrim(GALLERY_KEY, 0, 999);
            }
            // Save to media
            for (const url of imageUrls) {
              const filename = (() => {
                try { const u = new URL(url); return decodeURIComponent(u.pathname.split('/').pop() || 'image'); } catch { return 'image'; }
              })();
              const mediaItem = {
                id: crypto.randomUUID(),
                url,
                filename,
                mime: undefined,
                size: undefined,
                createdAt: now,
              };
              await kv.lpush(MEDIA_KEY, mediaItem);
              await kv.ltrim(MEDIA_KEY, 0, 999);
            }
            console.log('[clickup-webhook] saved images to gallery and media', { count: imageUrls.length });
          } catch (err) {
            console.error('[clickup-webhook] failed to save images', err);
          }
        }
        break;
      }
      case 'taskStatusUpdated': {
        // ClickUp often sends a history change structure
        const item = body?.history_items?.[0];
        const before = item?.before || body?.before;
        const after = item?.after || body?.after;
        const beforeStatus = before?.status || before?.status_type || before;
        const afterStatus = after?.status || after?.status_type || after;

        console.log('[clickup-webhook] taskStatusUpdated', {
          taskId,
          beforeStatus,
          afterStatus,
        });
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
