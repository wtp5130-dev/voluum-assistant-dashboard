// Helper endpoint to create/configure webhook via ClickUp API
// POST /api/clickup-webhook-setup?token=<token>

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export async function GET(request) {
  return new Response(JSON.stringify({ 
    info: 'POST /api/clickup-webhook-setup?list_id=901814679820&token=<optional>',
    note: 'Creates a list-level webhook for commentCreated events'
  }), { 
    status: 200, 
    headers: { 'Content-Type': 'application/json' } 
  });
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const allow = process.env.IMPORT_TOKEN || process.env.SEED_TOKEN || "";
    
    // If no auth token configured, skip check (less secure but allows setup)
    if (allow && token !== allow) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing CLICKUP_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const webhookUrl = process.env.WEBHOOK_URL || 'https://sidekick.projectx.to/api/clickup-webhook';
    // Prefer list-level webhook per agent design
    const listId = url.searchParams.get('list_id') || process.env.CLICKUP_LIST_ID || '901814679820';

    const payload = {
      endpoint: webhookUrl,
      events: ['commentCreated'],
      list_id: String(listId),
    };

    console.log('[clickup-webhook-setup] Creating LIST-level webhook with payload:', payload);

    const res = await fetch(`${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}/webhook`, {
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
