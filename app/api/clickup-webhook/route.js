// Next.js 14 App Router API route (JavaScript)
// POST /api/clickup-webhook
// Receives ClickUp webhook events and logs BannerBot-related updates

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
