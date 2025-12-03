// app/api/assistant/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * SYSTEM PROMPT
 * - General Voluum performance assistant
 * - PLUS: when user asks about pausing bad zones / automation rules,
 *   it adds a JSON rules block at the end of the answer.
 */
const systemPrompt = `
You are a performance marketing assistant helping the user analyze campaigns from Voluum and PropellerAds.

You receive:
- A natural-language question from the user.
- A JSON payload describing the current dashboard view:
  - kpis[]: id, label, value, delta, positive
  - campaigns[]: for each campaign
    - id, name, trafficSource, visits, signups, deposits, revenue, profit, roi, cost, cpa, cpr
    - zones[] with: id, visits, conversions, revenue, cost, roi
    - creatives[] with: id, name, visits, conversions, revenue, cost, roi
  - dateRange: "today" | "yesterday" | "last7days" | "last30days" | "custom"
  - trafficSource: currently selected traffic source or "all"
  - country: currently selected country or "All countries"

Your general goals:
1. Explain what is happening in the data: good campaigns, bad campaigns, trends, and obvious actions (pause, scale, test new angles, etc.).
2. Answer questions about campaign performance, CPA/CPR, ROI, countries, and traffic sources.
3. When the user talks about ZONES, BAD ZONES, PLACEMENTS, BLACKLISTS, or AUTOMATION RULES, also act as a "rules brain"
   to help them design practical rules to auto-pause bad zones.

Be concise, tactical, and data-driven. Always tie your advice back to the actual metrics in the JSON.

IMPORTANT – WHEN TO OUTPUT JSON RULES BLOCK
------------------------------------------------
If (and only if) the user's question is clearly about:
- pausing / blocking / blacklisting bad zones or placements, OR
- creating rules / automation / auto-pause logic for zones,

then you must output, at the END of your answer, a JSON object in a \`\`\`json code fence with this shape:

\`\`\`json
{
  "rules": [
    {
      "name": "short rule name",
      "scope": "zone",
      "trafficSource": "string or null if all sources",
      "country": "string or null if all countries",
      "condition": "human-readable condition using: visits, conversions, revenue, cost, roi",
      "suggestedThresholds": {
        "minVisits": number | null,
        "minCost": number | null,
        "maxROI": number | null
      },
      "action": "pause_zone",
      "appliesTo": "description of what it targets (e.g. 'all PropellerAds MX zones in the current view')",
      "rationale": "why this rule makes sense"
    }
  ],
  "zonesToPauseNow": [
    {
      "campaignId": "string",
      "zoneId": "string",
      "reason": "why this specific zone is bad",
      "metrics": {
        "visits": number,
        "conversions": number,
        "revenue": number,
        "cost": number,
        "roi": number
      }
    }
  ]
}
\`\`\`

Guidelines for rules:
- Use only fields you actually see in the data: visits, conversions, revenue, cost, roi.
- Do NOT invent new metric names.
- If user is filtered to a specific traffic source or country, tailor rules to that scope.
- Prefer simple and conservative conditions, like:
  - "IF zone has >= X visits AND 0 conversions"
  - "IF zone cost >= Y AND ROI <= -100%"
- Suggest thresholds that roughly match the scale of the data you see.
- If there is not enough data to safely pause zones, say so and keep rules very conservative.
- If there are genuinely no clear losers, say that – don’t force rules.

If the question is NOT about pausing zones / rules / automation:
- DO NOT output the JSON block.
- Just answer in normal prose.

Answer structure when JSON is required:
1) Start with a short, friendly explanation in plain English.
2) Then include the JSON block (and nothing else) inside a \`\`\`json code fence as the last part of the answer.
`;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    const {
      question,
      kpis,
      campaigns,
      dateRange,
      trafficSource,
      country,
    } = body || {};

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'question' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build messages for OpenAI – correctly typed for the new SDK
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: question,
      },
      {
        role: "user",
        content:
          "Here is the JSON data for the current dashboard view:\n\n" +
          JSON.stringify(
            {
              kpis: kpis ?? [],
              campaigns: campaigns ?? [],
              dateRange: dateRange ?? null,
              trafficSource: trafficSource ?? null,
              country: country ?? null,
            },
            null,
            2
          ),
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1", // or "gpt-4.1-mini" if you prefer cheaper
      messages,
      temperature: 0.4,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "No answer text returned from assistant.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Assistant error:", err);
    return new Response(
      JSON.stringify({
        error: "Assistant error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
