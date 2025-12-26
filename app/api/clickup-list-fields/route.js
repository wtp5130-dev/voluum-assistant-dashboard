// Helper endpoint to list all custom fields in a ClickUp list
// GET /api/clickup-list-fields?listId=<listId>

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const listId = url.searchParams.get('listId') || process.env.CLICKUP_LIST_ID || '901814532049';
    const apiKey = process.env.CLICKUP_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing CLICKUP_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch list info to get custom fields
    const res = await fetch(`${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}`, {
      method: 'GET',
      headers: { Authorization: apiKey },
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch list', details: data }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    const fields = data?.custom_fields || [];
    console.log('[clickup-list-fields] Available fields:', fields.map(f => ({ id: f.id, name: f.name, type: f.type })));

    return new Response(JSON.stringify({ listId, customFields: fields }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[clickup-list-fields] Error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
