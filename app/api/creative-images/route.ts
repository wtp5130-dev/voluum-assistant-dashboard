// app/api/creative-images/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { prompt, size } = body || {};

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const imageSize = (size as string) || "1024x1024";

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: imageSize as any,
      n: 1,
    });

    const url = result.data?.[0]?.url;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "No image URL returned from API" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("creative-images error:", err);
    return new Response(
      JSON.stringify({
        error: "creative-images error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
