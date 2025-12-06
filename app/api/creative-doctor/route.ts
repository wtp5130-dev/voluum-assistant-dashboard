// app/api/creative-doctor/route.ts
import OpenAI from "openai";
import { requirePermission } from "@/app/lib/permissions";

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

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.5,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "";
    const usage = (completion as any)?.usage || null;

    return new Response(
      JSON.stringify({
        reply,
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
