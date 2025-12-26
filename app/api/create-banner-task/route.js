// Next.js 14 App Router API route (JavaScript)
// POST /api/create-banner-task
// Creates a ClickUp task in the Design Assets list with status "design requested"

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

export async function POST(request) {
  const headers = corsHeaders();
  try {
    const body = await request.json();

    const apiKey = process.env.CLICKUP_API_KEY;
    const listId = process.env.CLICKUP_LIST_ID || '901814532049';

    if (!apiKey) {
      console.error('[create-banner-task] Missing CLICKUP_API_KEY env var');
      return new Response(
        JSON.stringify({ error: 'Server not configured. Missing CLICKUP_API_KEY.' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const name = body.bannerName || body.name;
    const description = body.description || '';
    const region = body.region || '';
    const brand = body.brand || '';

    if (!name || typeof name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: bannerName (string).' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const metaLines = [];
    if (region) metaLines.push(`Region: ${region}`);
    if (brand) metaLines.push(`Brand: ${brand}`);
    const metaBlock = metaLines.length ? `\n\n${metaLines.join('\n')}` : '';
    const fullDescription = `${description}${metaBlock}`;

    const payload = {
      name,
      description: fullDescription,
      status: 'design requested',
    };

    const url = `${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}/task`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Next.js fetch defaults are fine; no need for cache here
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error('[create-banner-task] ClickUp API error', {
        status: res.status,
        statusText: res.statusText,
        response: data,
      });
      return new Response(text || JSON.stringify({ error: 'ClickUp API error' }), {
        status: res.status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const taskUrl = data?.url || null;
    const taskId = data?.id || null;
    console.log('[create-banner-task] Task created', { taskId, taskUrl });

    return new Response(
      JSON.stringify({ success: true, taskUrl, taskId }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[create-banner-task] Unhandled error', err);
    return new Response(
      JSON.stringify({ error: 'Unhandled server error.' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}
