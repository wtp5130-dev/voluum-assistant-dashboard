// app/api/creative-images/route.ts
import OpenAI from "openai";
// Lazily construct OpenAI only when needed
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Simple in-memory cache for Adobe OAuth tokens (best-effort in serverless)
let adobeTokenCache: { token: string; expiresAt: number } | null = null;
async function getAdobeAccessToken(): Promise<string | null> {
  if (process.env.ADOBE_ACCESS_TOKEN) return process.env.ADOBE_ACCESS_TOKEN;
  const clientId = process.env.ADOBE_CLIENT_ID;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const scope = process.env.ADOBE_SCOPE || "ff_apis"; // Firefly APIs scope
  if (!clientId || !clientSecret) return null;
  const now = Date.now();
  if (adobeTokenCache && adobeTokenCache.expiresAt > now + 30_000) {
    return adobeTokenCache.token;
  }
  try {
    const tokenUrl = process.env.ADOBE_TOKEN_URL || "https://ims-na1.adobelogin.com/ims/token/v3";
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }),
    });
    const json = await res.json().catch(() => null as any);
    if (!res.ok || !json?.access_token) return null;
    const expiresIn = Number(json.expires_in || 3300);
    adobeTokenCache = { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return adobeTokenCache.token;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const prompt = body?.prompt;
    const size = body?.size || "1024x1024";
    const provider = String(body?.provider || process.env.CREATIVE_IMAGE_PROVIDER || "openai").toLowerCase();

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt' field" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (provider === "stability") {
      const key = process.env.STABILITY_API_KEY;
      if (!key) {
        return new Response(
          JSON.stringify({ error: "Missing STABILITY_API_KEY on server" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      const [wStr, hStr] = String(size).split("x");
      const width = Math.max(256, Math.min(2048, parseInt(wStr || "1024", 10) || 1024));
      const height = Math.max(256, Math.min(2048, parseInt(hStr || "1024", 10) || 1024));
      const model = process.env.STABILITY_MODEL || "stable-diffusion-xl-1024-v1-0";
      const endpoint = process.env.STABILITY_TTI_ENDPOINT || `https://api.stability.ai/v1/generation/${model}/text-to-image`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          cfg_scale: 7,
          height,
          width,
          samples: 1,
          steps: 30,
        }),
      });
      const txt = await res.text();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Stability error (${res.status})`, message: txt?.slice(0, 400) }),
          { status: res.status, headers: { "Content-Type": "application/json" } }
        );
      }
      const json = JSON.parse(txt);
      const base64 = json?.artifacts?.[0]?.base64;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image in Stability response" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      const url = `data:image/png;base64,${base64}`;
      return new Response(JSON.stringify({ url, provider: "stability" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (provider === "firefly") {
      const clientId = process.env.ADOBE_CLIENT_ID;
      const model = process.env.FIREFLY_MODEL || "firefly-v3";
      const endpoint = process.env.FIREFLY_TTI_ENDPOINT || "https://firefly-api.adobe.io/v3/images/generate";
      const token = await getAdobeAccessToken();
      const direct = process.env.ADOBE_ACCESS_TOKEN || token;
      if (!clientId || !direct) {
        return new Response(
          JSON.stringify({ error: "Missing Adobe credentials. Set ADOBE_CLIENT_ID and ADOBE_ACCESS_TOKEN or ADOBE_CLIENT_SECRET." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      const [wStr, hStr] = String(size).split("x");
      const width = Math.max(256, Math.min(2048, parseInt(wStr || "1024", 10) || 1024));
      const height = Math.max(256, Math.min(2048, parseInt(hStr || "1024", 10) || 1024));
      const bodyJson: any = {
        model,
        prompt: { text: prompt },
        size: { width, height },
        // Optional style hints; can be extended later
        // style: process.env.FIREFLY_STYLE || undefined,
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${direct}`,
          "x-api-key": clientId,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(bodyJson),
      });
      const txt = await res.text();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Firefly error (${res.status})`, message: txt?.slice(0, 400) }),
          { status: res.status, headers: { "Content-Type": "application/json" } }
        );
      }
      let json: any = null;
      try { json = txt ? JSON.parse(txt) : null; } catch {}
      // Try common output shapes
      const b64 = json?.image?.base64
        || json?.outputs?.[0]?.image?.base64
        || json?.content?.[0]?.asset?.base64;
      if (b64) {
        const url = `data:image/png;base64,${b64}`;
        return new Response(JSON.stringify({ url, provider: "firefly" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // If an asset URL is provided
      const assetUrl = json?.image?.url || json?.outputs?.[0]?.image?.url || json?.content?.[0]?.asset?.url;
      if (assetUrl) {
        return new Response(JSON.stringify({ url: assetUrl, provider: "firefly" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "No image in Firefly response" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Default: OpenAI
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY on server" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const client = getOpenAI();
    const result = await client.images.generate({ model: "gpt-image-1", prompt, n: 1, size });
    const image = (result as any).data?.[0];
    const url: string | undefined = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined);

    if (!url) {
      return new Response(
        JSON.stringify({
          error: "Image API returned no URL",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Frontend expects: { url: string }
    return new Response(JSON.stringify({ url, provider: "openai" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("creative-images error:", err);

    return new Response(
      JSON.stringify({
        error: "Image generation failed",
        message: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Optional: respond to GET with usage hint instead of 405 page
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      message: "Use POST with JSON body: { prompt: string, size?: '1024x1024' }",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
