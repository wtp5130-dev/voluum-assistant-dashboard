// app/api/assistant/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * SYSTEM PROMPT (enhanced with deterministic performance context)
 */
const systemPrompt = `
You are a performance marketing assistant helping the user analyze campaigns from Voluum and PropellerAds.

=== WHAT YOU RECEIVE ===
You will receive:
- A user question in natural language.
- A JSON payload summarizing the dashboard:
  - kpis[]
  - campaigns[] with zones[] and creatives[]
  - dateRange, trafficSource, country
- PLUS: A COMPUTED PERFORMANCE SUMMARY generated server-side.
  This summary contains:
    • A flat list of zones with: campaign name, zoneId, visits, conversions, revenue, cost, roi  
    • A list of zones with conversions > 0  
    • A list of top zones by ROI  
    • A list of worst zones by cost with zero conversions  
  YOU MUST TRUST this computed summary more than raw JSON.

=== GENERAL GOALS ===
1. Always ground your explanation in the ACTUAL numbers provided.  
2. Do not hallucinate — if summary says some zones have conversions, acknowledge them.  
3. Provide tactical, data-backed insights.  
4. If the user asks about:
   - pausing zones
   - automation rules
   - bad placements
   - blacklists  
   → THEN output a JSON rules block at the end of your answer.

=== RULES BLOCK FORMAT ===
If the user's question is about pausing zones / rules / automation:

Output a JSON object inside a code fence as the LAST part of your answer:

\`\`\`json
{
  "rules": [
    {
      "name": "Short rule name",
      "scope": "zone",
      "trafficSource": "string or null",
      "country": "string or null",
      "condition": "human-readable rule condition",
      "suggestedThresholds": {
        "minVisits": number | null,
        "minCost": number | null,
        "maxROI": number | null
      },
      "action": "pause_zone",
      "appliesTo": "Which zones this rule applies to",
      "rationale": "Why this rule makes sense"
    }
  ],
  "zonesToPauseNow": [
    {
      "campaignId": "string",
      "zoneId": "string",
      "reason": "why it is bad",
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

=== VERY IMPORTANT ===
- NEVER say “none of the zones have conversions” unless ALL zones truly have conversions = 0 in the computed summary.
- Always use metrics EXACTLY as provided: visits, conversions, revenue, cost, roi.
- If there is insufficient data for firm rules, recommend conservative thresholds.
- If the question is NOT about automation/rules/pausing → DO NOT output the JSON block.
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

    /**
     * ======================================================
     *  COMPUTE ANALYTICS SUMMARY (NON-LLM, deterministic)
     * ======================================================
     */
    const zonesFlat: any[] = [];

    for (const c of campaigns ?? []) {
      for (const z of c.zones ?? []) {
        zonesFlat.push({
          campaignId: c.id,
          campaignName: c.name,
          zoneId: z.id ?? "(unknown)",
          visits: z.visits ?? 0,
          conversions: z.conversions ?? 0,
          revenue: z.revenue ?? 0,
          cost: z.cost ?? 0,
          roi: z.roi ?? 0,
        });
      }
    }

    const zonesWithConversions = zonesFlat.filter((z) => z.conversions > 0);

    const topZones = [...zonesFlat]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 5);

    const worstZonesNoConv = [...zonesFlat]
      .filter((z) => z.conversions === 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const computedContext = {
      zoneCount: zonesFlat.length,
      zonesWithConversions,
      topZones,
      worstZonesNoConv,
      sampleZones: zonesFlat.slice(0, 20),
    };

    /**
     * ================================
     *  BUILD MESSAGES FOR OPENAI
     * ================================
     */
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
      {
        role: "user",
        content:
          "Here is the RAW dashboard JSON:\n\n" +
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
      {
        role: "user",
        content:
          "Here is the COMPUTED performance summary (trust this over raw):\n\n" +
          JSON.stringify(computedContext, null, 2),
      },
    ];

    /**
     * ================================
     *  CALL OPENAI
     * ================================
     */
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
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
