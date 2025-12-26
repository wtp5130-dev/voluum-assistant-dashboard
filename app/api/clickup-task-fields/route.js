// Helper endpoint to inspect custom fields from an existing task
// GET /api/clickup-task-fields?taskId=<taskId>

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId') || url.searchParams.get('task');
    const apiKey = process.env.CLICKUP_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing CLICKUP_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    if (!taskId) {
      return new Response(JSON.stringify({ error: 'Missing taskId parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch task info to see custom fields
    const res = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: apiKey },
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch task', details: data }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    const customFields = data?.custom_fields || [];
    const fields = customFields.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      value: f.value,
    }));

    console.log('[clickup-task-fields] Task custom fields:', fields);

    return new Response(JSON.stringify({ taskId, customFields: fields }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[clickup-task-fields] Error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
