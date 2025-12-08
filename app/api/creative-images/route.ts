// app/api/creative-images/route.ts
import OpenAI from "openai";
// Lazily construct OpenAI only when needed
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Support both JSON and multipart bodies
    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let form: FormData | null = null;
    if (contentType.includes("multipart/form-data")) {
      form = await (req as any).formData();
      const entries = form ? Array.from(form.entries()) : [];
      body = Object.fromEntries(entries.map(([k, v]) => [k, typeof v === "string" ? v : v]));
    } else {
      try { body = await req.json(); } catch { body = {}; }
    }

    const prompt = body?.prompt;
    const size = body?.size || "1024x1024";
    const provider = String(body?.provider || process.env.CREATIVE_IMAGE_PROVIDER || "ideogram").toLowerCase();

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
      const stylePreset = body?.style_preset || body?.stylePreset || undefined;
      const negative = body?.negative_prompt || body?.negativePrompt || undefined;
      const seedVal = body?.seed || undefined;
      let res: Response;
      if (form && (form.getAll("character_reference_images").length > 0 || form.get("image"))) {
        // Forward as multipart with files
        const upstream = new FormData();
        upstream.append("prompt", String(prompt));
        upstream.append("width", String(width));
        upstream.append("height", String(height));
        upstream.append("model", String(model));
        upstream.append("rendering_speed", String(renderingSpeed));
        if (stylePreset) upstream.append("style_preset", String(stylePreset));
        if (negative) upstream.append("negative_prompt", String(negative));
        if (seedVal) upstream.append("seed", String(seedVal));
        for (const f of form.getAll("character_reference_images")) {
          if (typeof f !== "string") upstream.append("character_reference_images", f as any);
        }
        const img = form.get("image");
        if (img && typeof img !== "string") upstream.append("image", img as any);
        res = await fetch(endpoint, { method: "POST", headers: { "Api-Key": key }, body: upstream as any });
      } else {
        const bodyJson: any = { prompt, width, height, model, rendering_speed: renderingSpeed };
        if (stylePreset) bodyJson.style_preset = stylePreset;
        if (negative) bodyJson.negative_prompt = negative;
        if (seedVal) bodyJson.seed = seedVal;
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Api-Key": key, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(bodyJson),
        });
      }
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
