// app/api/creative-images/route.ts
import OpenAI from "openai";
// Lazily construct OpenAI only when needed
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
