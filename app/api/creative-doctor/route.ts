import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
You are a "Creative Doctor" for performance marketing.

You receive:
- A user question about creatives, angles, ads, burn, or testing.
- A JSON context with:
  - creatives[]: flattened rows with
    - creativeId, name, campaignName, trafficSource, visits, conversions, cost, revenue, roi, health (winner|at_risk|loser|neutral)
  - campaigns[]: campaign-level stats (signups, deposits, revenue, ROI, cost, etc.)
  - dateRange, from, to, trafficSourceFilter

Your goals:
1. Analyze which creatives are:
   - top winners (high ROI / conversions)
   - at risk (was good but now weaker or low margin)
   - burners (spend but no conversions / very negative ROI)
2. Give extremely practical suggestions:
   - which creatives to scale, pause, or rotate
   - which angles are working (e.g. bonus, FOMO, casino luck, scarcity, social proof, etc.)
3. When user asks for IDEAS or NEW CREATIVES:
   - generate specific, punchy examples:
     - push notifications: title + message + optional icon suggestion
     - banner angles: headline + value prop + CTA
   - always tie them back to what is working in the data (if possible).

Style:
- Be concise, tactical, and data-driven.
- Reference specific creatives by name / ID and key metrics (visits, conversions, ROI, cost).
- Use bullet points a lot.
- If data is very thin, be conservative and say so.

DO NOT invent metrics that are not present. Only use: visits, conversions, cost, revenue, roi, health, signups, deposits at campaign level.
`;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { message, context } = body || {};

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'message' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const contextText =
      context != null
        ? JSON.stringify(context, null, 2)
        : "{}";

    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: message,
      },
      {
        role: "user" as const,
        content:
          "Here is the JSON context with creatives and campaigns:\n\n" +
          contextText,
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages,
      temperature: 0.5,
    });

    const reply =
      completion.choices?.[0]?.message?.content ??
      "No reply text returned from Creative Doctor.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Creative Doctor error:", err);
    return new Response(
      JSON.stringify({
        error: "Creative Doctor error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
