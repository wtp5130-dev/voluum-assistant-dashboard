// app/api/creative-doctor/route.ts
import OpenAI from "openai";

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
    const body = await req.json();
    const { question, campaign, creatives, dateRange, from, to } = body || {};

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'question' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const context = {
      campaign: campaign ?? null,
      creatives: creatives ?? [],
      dateRange: dateRange ?? null,
      from: from ?? null,
      to: to ?? null,
    };

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: question },
      {
        role: "user" as const,
        content:
          "Here is the JSON data for the selected campaign and creatives:\n\n" +
          JSON.stringify(context, null, 2),
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.5,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "No answer text returned from Creative Doctor.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("creative-doctor error:", err);
    return new Response(
      JSON.stringify({
        error: "creative-doctor error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
