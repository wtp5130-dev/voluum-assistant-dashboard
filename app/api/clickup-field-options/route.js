// Helper endpoint to get dropdown options for custom fields
// GET /api/clickup-field-options?fieldId=<fieldId>

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const fieldId = url.searchParams.get('fieldId');
    const taskId = url.searchParams.get('taskId'); // Need any task from the list to get field info
    const apiKey = process.env.CLICKUP_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing CLICKUP_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    if (!fieldId || !taskId) {
      return new Response(JSON.stringify({ error: 'Missing fieldId or taskId parameters' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch task to get custom field definitions
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
    const field = customFields.find(f => f.id === fieldId);

    if (!field) {
      return new Response(JSON.stringify({ error: 'Field not found', fieldId }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const options = field?.type_config?.options || [];
    const mapped = options.map(opt => ({
      id: opt.id,
      name: opt.name,
    }));

    console.log('[clickup-field-options] Field options:', { fieldId, fieldName: field.name, options: mapped });

    return new Response(JSON.stringify({ fieldId, fieldName: field.name, options: mapped }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[clickup-field-options] Error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
