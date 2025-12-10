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
        // Hint to Ideogram V3 that we may use character/image references
        try {
          const hasCharRefs = form.getAll("character_reference_images").length > 0;
          const hasImage = Boolean(form.get("image"));
          if (hasCharRefs || hasImage) upstream.append("style_type", "AUTO");
        } catch {}
        if (stylePreset) upstream.append("style_preset", String(stylePreset));
        if (negative) upstream.append("negative_prompt", String(negative));
        if (seedVal) upstream.append("seed", String(seedVal));
        const refInf = form.get("reference_influence");
        if (refInf != null) upstream.append("reference_influence", String(refInf));
        const imgInf = (form as any).get?.("image_reference_influence");
        if (imgInf != null) upstream.append("image_reference_influence", String(imgInf));
        for (const f of form.getAll("character_reference_images")) {
          if (typeof f !== "string") upstream.append("character_reference_images", f as any);
        }
        const img = form.get("image");
        if (img && typeof img !== "string") upstream.append("image", img as any);
        res = await fetch(endpoint, { method: "POST", headers: { "Api-Key": key }, body: upstream as any });
        if (!res.ok) {
          const errTxt = await res.text();
          const looksLikePresetError = res.status === 400 && (String(errTxt || "").includes("style_preset") || String(errTxt || "").includes("one of"));
          if (looksLikePresetError && stylePreset) {
            const upstreamFallback = new FormData();
            upstreamFallback.append("prompt", String(prompt));
            upstreamFallback.append("width", String(width));
            upstreamFallback.append("height", String(height));
            upstreamFallback.append("model", String(model));
            upstreamFallback.append("rendering_speed", String(renderingSpeed));
            try {
              const hasCharRefs = form.getAll("character_reference_images").length > 0;
              const hasImage = Boolean(form.get("image"));
              if (hasCharRefs || hasImage) upstreamFallback.append("style_type", "AUTO");
            } catch {}
            if (negative) upstreamFallback.append("negative_prompt", String(negative));
            if (seedVal) upstreamFallback.append("seed", String(seedVal));
            const refInf2 = form.get("reference_influence");
            if (refInf2 != null) upstreamFallback.append("reference_influence", String(refInf2));
            const imgInf2 = (form as any).get?.("image_reference_influence");
            if (imgInf2 != null) upstreamFallback.append("image_reference_influence", String(imgInf2));
            for (const f of form.getAll("character_reference_images")) {
              if (typeof f !== "string") upstreamFallback.append("character_reference_images", f as any);
            }
            const img2 = form.get("image");
            if (img2 && typeof img2 !== "string") upstreamFallback.append("image", img2 as any);
            res = await fetch(endpoint, { method: "POST", headers: { "Api-Key": key }, body: upstreamFallback as any });
            if (!res.ok) {
              // Restore errTxt for return path below
              (res as any).__original_error_text = errTxt;
            }
          } else {
            (res as any).__original_error_text = errTxt;
          }
        }
      } else {
        const bodyJson: any = { prompt, width, height, model, rendering_speed: renderingSpeed };
        if (stylePreset) bodyJson.style_preset = stylePreset;
        if (negative) bodyJson.negative_prompt = negative;
        if (seedVal) bodyJson.seed = seedVal;
        if (body?.reference_influence != null) bodyJson.reference_influence = Number(body.reference_influence);
        if (body?.image_reference_influence != null) bodyJson.image_reference_influence = Number(body.image_reference_influence);
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Api-Key": key, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(bodyJson),
        });
        if (!res.ok) {
          const errTxt = await res.text();
          const looksLikePresetError = res.status === 400 && (String(errTxt || "").includes("style_preset") || String(errTxt || "").includes("one of"));
          if (looksLikePresetError && stylePreset) {
            const bodyJsonFallback: any = { ...bodyJson };
            delete bodyJsonFallback.style_preset;
            res = await fetch(endpoint, {
              method: "POST",
              headers: { "Api-Key": key, "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify(bodyJsonFallback),
            });
            if (!res.ok) {
              (res as any).__original_error_text = errTxt;
            }
          } else {
            (res as any).__original_error_text = errTxt;
          }
        }
      }
      const txt = await res.text();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Ideogram error (${res.status})`, message: (txt || (res as any).__original_error_text || "")?.slice(0, 400) }),
          { status: res.status, headers: { "Content-Type": "application/json" } }
        );
      }
      let json: any = null;
      try { json = txt ? JSON.parse(txt) : null; } catch {}
      const b64 = json?.data?.[0]?.b64_json || json?.image?.base64 || json?.outputs?.[0]?.image?.base64;
      if (b64) {
        const url = `data:image/png;base64,${b64}`;
        try {
          // Save to gallery (best-effort)
          // @ts-ignore dynamic import types
          const { kv } = await import("@vercel/kv");
          const save = body?.saveToGallery !== false;
          if (save) {
            await kv.lpush("gallery:images", {
              id: crypto.randomUUID(),
              url,
              provider: "ideogram",
              prompt,
              size,
              style_preset: body?.style_preset,
              negative_prompt: body?.negative_prompt,
              seed: body?.seed,
              brandId: body?.brandId,
              brandName: body?.brandName,
              createdAt: new Date().toISOString(),
            });
            await kv.ltrim("gallery:images", 0, 999);
          }
        } catch {}
        return new Response(JSON.stringify({ url, provider: "ideogram" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const url = json?.data?.[0]?.url || json?.image?.url || json?.outputs?.[0]?.image?.url;
      if (url) {
        try {
          // @ts-ignore dynamic import types
          const { kv } = await import("@vercel/kv");
          const save = body?.saveToGallery !== false;
          if (save) {
            await kv.lpush("gallery:images", {
              id: crypto.randomUUID(),
              url,
              provider: "ideogram",
              prompt,
              size,
              style_preset: body?.style_preset,
              negative_prompt: body?.negative_prompt,
              seed: body?.seed,
              brandId: body?.brandId,
              brandName: body?.brandName,
              createdAt: new Date().toISOString(),
            });
            await kv.ltrim("gallery:images", 0, 999);
          }
        } catch {}
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
