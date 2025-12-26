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
    const contentType = request.headers.get('content-type') || '';
    let body = {};
    let uploadFiles = [];
    if (contentType.includes('multipart/form-data')) {
      // Native Sidekick form submission
      const fd = await request.formData();
      const toStr = (v) => (typeof v === 'string' ? v : (v ? String(v) : ''));
      body = {
        bannerName: toStr(fd.get('title') || fd.get('bannerName') || fd.get('name')),
        description: toStr(fd.get('description') || ''),
        region: toStr(fd.get('country') || fd.get('region') || ''),
        brand: toStr(fd.get('brand') || ''),
        status: toStr(fd.get('status') || ''),
        listId: toStr(fd.get('listId') || fd.get('list_id') || ''),
        sizes: (fd.getAll('sizes') || fd.getAll('sizes[]') || []).map(toStr).filter(Boolean),
        customSize: toStr(fd.get('customSize') || ''),
        requesterInfo: toStr(fd.get('requesterInfo') || ''),
      };
      // Collect reference files (can be multiple)
      const refs = fd.getAll('reference').concat(fd.getAll('references') || []);
      uploadFiles = refs.filter((f) => typeof f === 'object' && f && 'arrayBuffer' in f);
    } else {
      // JSON body (programmatic usage)
      body = await request.json();
    }

    const apiKey = process.env.CLICKUP_API_KEY;
    // Allow overriding list via request body; fallback to env; then default
    let listId = body.listId || body.list_id || process.env.CLICKUP_LIST_ID || '901814532049';
    // Basic sanitization (ClickUp list IDs are numeric strings)
    if (typeof listId !== 'string') listId = String(listId ?? '');
    listId = listId.trim();
    if (!/^\d{6,}$/.test(listId)) {
      console.warn('[create-banner-task] Invalid listId provided, falling back to env/default', { listId });
      listId = process.env.CLICKUP_LIST_ID || '901814532049';
    }

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
    const sizes = Array.isArray(body.sizes) ? body.sizes : [];
    const customSize = body.customSize || '';
    const requesterInfo = body.requesterInfo || '';
    const requestedStatus = (body.status || process.env.CLICKUP_DEFAULT_STATUS || 'design requested').toString().trim();

    if (!name || typeof name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: bannerName (string).' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const metaLines = [];
    if (region) metaLines.push(`Region: ${region}`);
    if (brand) metaLines.push(`Brand: ${brand}`);
    if (sizes.length) metaLines.push(`Requested Outputs: ${sizes.join(', ')}`);
    if (customSize) metaLines.push(`Custom Size: ${customSize}`);
    if (requesterInfo) metaLines.push(`Requester: ${requesterInfo}`);
    const metaBlock = metaLines.length ? `\n\n${metaLines.join('\n')}` : '';
    const fullDescription = `${description}${metaBlock}`;

    // Resolve a valid status for this list; if the requested status doesn't exist,
    // fall back to the list's first "open" status or omit the field (use default).
    let statusToUse = null;
    try {
      const infoRes = await fetch(`${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}`, {
        method: 'GET',
        headers: { 'Authorization': apiKey },
      });
      const infoText = await infoRes.text();
      let info;
      try { info = infoText ? JSON.parse(infoText) : {}; } catch { info = { raw: infoText }; }
      const statuses = Array.isArray(info?.statuses) ? info.statuses : [];
      if (statuses.length) {
        const desired = statuses.find(s => (s?.status || '').toLowerCase() === requestedStatus.toLowerCase());
        if (desired?.status) {
          statusToUse = desired.status;
        } else {
          const open = statuses.find(s => (s?.type || '').toLowerCase() === 'open');
          if (open?.status) statusToUse = open.status;
        }
      }
    } catch (e) {
      console.warn('[create-banner-task] Could not read list statuses; proceeding without explicit status', e);
    }

    const payload = {
      name,
      description: fullDescription,
      ...(statusToUse ? { status: statusToUse } : {}),
      // Set custom fields for Brand and Country using option UUIDs
      custom_fields: [
        ...(brand ? [{
          id: "b61295d4-a40f-46cf-b26c-bb5d0ccfe787", // Brand dropdown
          value: {
            "3Star88": "517b3c83-a4c1-4ec7-a7dc-a4d39db6fa65",
            "Sol88": "fb0d410a-1abc-49f7-b67c-b6fbc0d544cb",
          }[brand] || brand,
        }] : []),
        ...(region ? [{
          id: "0316edfe-3f07-41d5-9576-25f746285602", // Country dropdown
          value: {
            "Malaysia": "111ba6eb-42b9-4025-b3a2-be694056a194",
            "Indonesia": "cda9e804-dfc8-4925-adca-02b4711cac0c",
            "Thailand": "efd3809d-c91b-47db-9049-877977fb3a3b",
            "Singapore": "2b9d8866-70b6-4f64-8ae9-1051195c737d",
            "Mexico": "a8f31c37-2600-445c-8abf-144aa1a1656c",
          }[region] || region,
        }] : []),
      ],
    };

    const url = `${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}/task`;
    console.log('[create-banner-task] Creating task with payload:', JSON.stringify({ ...payload, description: payload.description.substring(0, 100) + '...' }, null, 2));
    
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
        requestPayload: payload,
      });
      return new Response(text || JSON.stringify({ error: 'ClickUp API error' }), {
        status: res.status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const taskUrl = data?.url || null;
    const taskId = data?.id || null;
    console.log('[create-banner-task] Task created', { taskId, taskUrl, listIdUsed: listId, statusUsed: statusToUse || '(default)' });

    // If files were uploaded, attach them to the new task
    if (taskId && uploadFiles && uploadFiles.length) {
      for (const file of uploadFiles) {
        try {
          const fdUp = new FormData();
          fdUp.append('attachment', file, file.name || 'reference');
          const upRes = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}/attachment`, {
            method: 'POST',
            headers: { 'Authorization': apiKey },
            body: fdUp,
          });
          if (!upRes.ok) {
            const errText = await upRes.text();
            console.warn('[create-banner-task] Attachment upload failed', { status: upRes.status, errText });
          }
        } catch (e) {
          console.warn('[create-banner-task] Attachment upload error', e);
        }
      }
    }

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
