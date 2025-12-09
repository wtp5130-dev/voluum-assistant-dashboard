// app/api/creative-doctor/route.ts
import OpenAI from "openai";
import { requirePermission } from "@/app/lib/permissions";
import { kv } from "@vercel/kv";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
You are "Creative Doctor" for performance marketing creatives.

You receive:
- A natural-language QUESTION from the user.
- A JSON payload with:
  - campaign: id, name, trafficSource, visits, signups, deposits, revenue, profit, roi, cost, cpa, cpr
  - creatives[]: id, name, visits, conversions, revenue, cost, roi
  - dateRange, from, to

Goals:
1. Summarize which creatives are top performers vs weak ones.
2. Explain WHY (click intent, funnel, angle, fatigue, etc.), using the metrics.
3. Suggest concrete next actions:
   - which creatives to scale
   - which to pause
   - which angles / hooks / variations to test next
4. When the user asks for ideas, include:
   - 3–5 specific angle ideas (hook + benefit + twist)
   - Optional image prompt suggestions they can feed into an image generator.

Rules:
- Always tie your reasoning to the actual metrics: visits, conversions, revenue, cost, roi.
- If the data is thin, be conservative and say so.
- Format your answer in short sections and bullet points, not long walls of text.
`;

export async function POST(req: Request): Promise<Response> {
  try {
    const ok = await requirePermission("creatives");
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json();

    // Support both the older shape (question + fields) and the UI's current shape (messages + context)
    const incomingMessages = Array.isArray(body?.messages)
      ? (body.messages as Array<{ role: string; content: string }>)
      : [];
    const question =
      typeof body?.question === "string" && body.question.trim().length > 0
        ? (body.question as string)
        : undefined;

    if (!incomingMessages.length && !question) {
      return new Response(
        JSON.stringify({ error: "Provide 'messages' array or a 'question' string" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const legacyContext = {
      campaign: body?.campaign ?? null,
      creatives: body?.creatives ?? [],
      dateRange: body?.dateRange ?? null,
      from: body?.from ?? null,
      to: body?.to ?? null,
    };

    const context = body?.context ?? legacyContext;

    // Optional brand support: if brandUrl is provided and we have a stored brand style, attach concise style notes
    let brandStyleNotes = "";
    const brandUrl = String(body?.brandUrl || body?.brand || "").trim();
    const brandNoCache = Boolean(body?.brandNoCache);
    if (brandUrl) {
      try {
        const host = new URL(brandUrl).host;
        const saved = brandNoCache ? null : ((await kv.get(`brand:style:${host}`)) as any);
        if (saved?.profile) {
          const p = saved.profile;
          brandStyleNotes = [
            `Brand: ${p.name || host}`,
            p.tone ? `Tone: ${p.tone}` : null,
            p.voice ? `Voice: ${p.voice}` : null,
            Array.isArray(p.colors) && p.colors.length ? `Colors: ${p.colors.join(", ")}` : null,
            Array.isArray(p.keywords) && p.keywords.length ? `Keywords: ${p.keywords.slice(0, 10).join(", ")}` : null,
            Array.isArray(p.ctas) && p.ctas.length ? `CTAs: ${p.ctas.join(", ")}` : null,
            p.summary ? `Summary: ${p.summary}` : null,
          ].filter(Boolean).join("\n");
        }
      } catch {}
    }

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (incomingMessages.length) {
      for (const m of incomingMessages) {
        if (m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")) {
          chatMessages.push({ role: m.role as "user" | "assistant", content: m.content });
        }
      }
    } else if (question) {
      chatMessages.push({ role: "user", content: question });
    }

    chatMessages.push({
      role: "user",
      content:
        "Context JSON (campaigns/selection/date range if provided):\n\n" +
        JSON.stringify(context ?? {}, null, 2),
    });

    // Prepend brand style notes if present
    if (brandStyleNotes) {
      chatMessages.push({ role: "user", content: `Apply these brand style notes when evaluating and rewriting creatives (respect the tone, voice, and CTAs):\n\n${brandStyleNotes}` });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.5,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    const usage = (completion as any)?.usage || null;

    // Optional: Ideogram prompt pack aligned to brand
    let ideogramPrompts: Array<{
      title?: string;
      prompt: string;
      negative_prompt?: string;
      style_preset?: string;
      rendering_speed?: "TURBO" | "QUALITY";
      width?: number;
      height?: number;
      seed?: number;
    }> | undefined;
    let brandContext: any = undefined;
    if (brandStyleNotes) {
      try {
        // Try to retrieve full saved brand profile for richer fields
        const host = new URL(brandUrl).host;
        const saved = (await kv.get(`brand:style:${host}`)) as any;
        const profile = saved?.profile || null;
        brandContext = profile
          ? { name: profile.name, tone: profile.tone, voice: profile.voice, colors: profile.colors, ctas: profile.ctas, styleNotes: profile.styleNotes, dos: profile.dos, donts: profile.donts }
          : undefined;

        const promptForPrompts = `You are crafting image generation prompts for Ideogram's API. Create 4 distinct, brand-aligned prompts that are ready to send to Ideogram's /v1/ideogram-v3/generate endpoint. Each entry must be a compact object with keys: { title, prompt, negative_prompt, style_preset, rendering_speed, width, height }.

Rules:
- Keep prompts specific and visual; include subject, setting, composition, lighting, and any typography if appropriate.
- Respect brand tone/voice, CTAs, color accents, and style notes.
- Use rendering_speed = "TURBO" by default. width/height should be common ad-friendly sizes (e.g., 1024x1024 or 1200x628).
- style_preset: choose a fitting preset (e.g., 90S_NOSTALGIA, ART_BRUT, C4D_CARTOON, JAPANDI_FUSION) or "AUTO" if uncertain.
- negative_prompt: include short avoids from brand donts.

Return strict JSON with key ideogramPrompts: [{...}]. No extra commentary.`;

        const msg: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: "You design brand-aligned Ideogram prompts for ad creatives." },
          { role: "user", content: `Brand style notes:\n${brandStyleNotes}` },
          { role: "user", content: `Optional brand profile JSON (if present):\n${JSON.stringify(brandContext || {}, null, 2)}` },
          { role: "user", content: `Campaign/Creatives context:\n${JSON.stringify(context || {}, null, 2)}` },
          { role: "user", content: promptForPrompts },
        ];
        const gen = await client.chat.completions.create({ model: "gpt-4.1-mini", temperature: 0.3, messages: msg });
        const txt = gen.choices?.[0]?.message?.content || "";
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          if (Array.isArray(parsed?.ideogramPrompts)) ideogramPrompts = parsed.ideogramPrompts;
        }
      } catch (e) {
        // ignore prompt-pack errors and still return main reply
      }
    }

    return new Response(
      JSON.stringify({
        reply,
        ideogramPrompts,
        brandContext,
        tokenUsage: usage
          ? {
              total: usage.total_tokens,
              prompt: usage.prompt_tokens,
              completion: usage.completion_tokens,
            }
          : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("creative-doctor error (setup):", err);
    return new Response(
      JSON.stringify({
        error: "creative-doctor error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Optional helper: respond to GET with usage hint instead of 405
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      message:
        "POST JSON to this endpoint: { question: string, campaign?: object, creatives?: array, dateRange?: string, from?: string, to?: string }",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
