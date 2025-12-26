// Helper endpoint to create/configure webhook via ClickUp API
// POST /api/clickup-webhook-setup?token=<token>

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const allow = process.env.IMPORT_TOKEN || process.env.SEED_TOKEN || "";
    
    if (!allow || token !== allow) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing CLICKUP_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const webhookUrl = process.env.WEBHOOK_URL || 'https://sidekick.projectx.to/api/clickup-webhook';
    const teamId = process.env.CLICKUP_TEAM_ID || '9018118988'; // Your team/workspace ID

    // Create webhook subscription with specific events
    const payload = {
      endpoint: webhookUrl,
      events: [
        'taskCommentPosted',
        'taskAttachmentCreated',
        'taskAttachmentUpdated',
        'taskStatusUpdated',
      ],
    };

    console.log('[clickup-webhook-setup] Creating webhook with payload:', payload);

    const res = await fetch(`${CLICKUP_API_BASE}/team/${encodeURIComponent(teamId)}/webhook`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error('[clickup-webhook-setup] API error', { status: res.status, response: data });
      return new Response(JSON.stringify({ error: 'Failed to create webhook', details: data }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    console.log('[clickup-webhook-setup] Webhook created successfully:', data);
    return new Response(JSON.stringify({ ok: true, webhook: data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[clickup-webhook-setup] Error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
