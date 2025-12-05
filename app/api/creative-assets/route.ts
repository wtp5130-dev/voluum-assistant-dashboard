// app/api/creative-assets/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type AdTypeKey = "push-classic" | "inpage-push" | "interstitial" | "onclick";

const AD_TYPE_DETAILS: Record<
  AdTypeKey,
  {
    label: string;
    notes: string;
    mainImageSize: string;
    iconSize?: string | null;
    required: string[];
  }
> = {
  "push-classic": {
    label: "Propeller Push",
    notes: "Square icon + square/vertical banner.",
    mainImageSize: "1024x1024",
    iconSize: "512x512",
    required: ["title", "description", "icon", "main image"],
  },
  "inpage-push": {
    label: "In-Page Push",
    notes: "Square icon + rectangle/3:2 banner.",
    mainImageSize: "1024x768",
    iconSize: "512x512",
    required: ["title", "description", "icon", "main image"],
  },
  interstitial: {
    label: "Interstitial",
    notes: "Full-screen (portrait) image; copy is optional.",
    mainImageSize: "1080x1920",
    iconSize: null,
    required: ["main image", "optional copy"],
  },
  onclick: {
    label: "Onclick / Direct Click",
    notes: "Hero image aimed at CTR (landscape).",
    mainImageSize: "1200x628",
    iconSize: null,
    required: ["main image"],
  },
};

const systemPrompt = `
You are a Propeller ads creative planner. Given a short creative brief and ad type, respond **only** with JSON that contains
the following keys: title, description, mainImagePrompt, iconPrompt, mainImageSize, iconSize.
Provide copy plus image prompts that respect the ad type (mention CTAs, benefits, and dimensions). Do not wrap the JSON in markdown. Even if you cannot fill a field, return it as an empty string.
`;

function extractJsonPayload(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not find JSON object in model response");
  }
  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY on server" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const prompt = body?.prompt;
  const adType: AdTypeKey =
    (body?.adType as AdTypeKey) ?? ("push-classic" as AdTypeKey);

  if (!prompt || typeof prompt !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid 'prompt' field" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const metadata = AD_TYPE_DETAILS[adType] ?? AD_TYPE_DETAILS["push-classic"];

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            `Ad type: ${metadata.label} (${adType}).`,
            `Dimensions: ${metadata.mainImageSize} for the main image${metadata.iconSize ? `, ${metadata.iconSize} for the icon` : ""}.`,
            `Required elements: ${metadata.required.join(", ")}.`,
            "",
            `Brief: ${prompt}`,
          ].join("\n"),
        },
      ],
      temperature: 0.6,
    });

    const assistantContent =
      completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJsonPayload(assistantContent);

    const result = {
      title: String(parsed.title ?? "") ?? "",
      description: String(parsed.description ?? "") ?? "",
      mainImagePrompt:
        String(parsed.mainImagePrompt ?? parsed.imagePrompt ?? "") ?? "",
      iconPrompt: String(parsed.iconPrompt ?? "") ?? "",
      mainImageSize:
        String(parsed.mainImageSize ?? metadata.mainImageSize) ??
        metadata.mainImageSize,
      iconSize:
        String(parsed.iconSize ?? metadata.iconSize ?? "") || null,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("creative-assets error:", err);
    return new Response(
      JSON.stringify({
        error: "creative-assets error",
        message: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      message:
        "POST JSON to this endpoint with { prompt: string, adType?: 'push-classic' | 'inpage-push' | 'interstitial' | 'onclick' }",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
