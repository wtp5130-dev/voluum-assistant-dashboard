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

    if (provider === "ideogram") {
      const key = process.env.IDEOGRAM_API_KEY;
      const endpoint = process.env.IDEOGRAM_TTI_ENDPOINT || "https://api.ideogram.ai/v1/ideogram-v3/generate";
      if (!key || !endpoint) {
        return new Response(
          JSON.stringify({ error: "Missing IDEOGRAM_API_KEY or IDEOGRAM_TTI_ENDPOINT on server" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      const [wStr, hStr] = String(size).split("x");
      const width = Math.max(256, Math.min(2048, parseInt(wStr || "1024", 10) || 1024));
      const height = Math.max(256, Math.min(2048, parseInt(hStr || "1024", 10) || 1024));
      const model = process.env.IDEOGRAM_MODEL || "ideogram-3";
      const renderingSpeed = process.env.IDEOGRAM_RENDERING_SPEED || "TURBO"; // TURBO | QUALITY
      const bodyJson: any = {
        prompt,
        width,
        height,
        model,
        rendering_speed: renderingSpeed,
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Api-Key": key,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(bodyJson),
      });
      const txt = await res.text();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Ideogram error (${res.status})`, message: txt?.slice(0, 400) }),
          { status: res.status, headers: { "Content-Type": "application/json" } }
        );
      }
      let json: any = null;
      try { json = txt ? JSON.parse(txt) : null; } catch {}
      const b64 = json?.data?.[0]?.b64_json || json?.image?.base64 || json?.outputs?.[0]?.image?.base64;
      if (b64) {
        const url = `data:image/png;base64,${b64}`;
        return new Response(JSON.stringify({ url, provider: "ideogram" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const url = json?.data?.[0]?.url || json?.image?.url || json?.outputs?.[0]?.image?.url;
      if (url) {
        return new Response(JSON.stringify({ url, provider: "ideogram" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "No image in Ideogram response" }), { status: 500, headers: { "Content-Type": "application/json" } });
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
