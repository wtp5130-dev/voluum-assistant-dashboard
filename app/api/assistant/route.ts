// app/api/assistant/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 🚀 ADVANCED SYSTEM PROMPT
 * Includes:
 * - Zone analytics
 * - Creative analytics
 * - Traffic source intelligence
 * - CPA/CPR guidance
 * - Outlier detection guidelines
 * - Rule-writing engine with JSON block output
 * - Strict grounding on computed data
 */
const systemPrompt = `
You are a senior performance marketing strategist specializing in Voluum + PropellerAds push traffic.

You receive:
1. A natural-language question from the user.
2. RAW JSON from the dashboard.
3. A COMPUTED analytics summary (trust this above everything else).

==========================================================
DO NOT HALLUCINATE METRICS — ONLY use the computed summary.
==========================================================

Your responsibilities:
----------------------------------------------------------
1. Explain what is happening in the data clearly + accurately.
2. Identify good zones, bad zones, outliers, and profitable pockets.
3. Recommend tactical actions:
   - pause
   - scale
   - bid adjust
   - creative rotation
   - country/zone filtering
4. Detect patterns across:
   • traffic sources
   • creatives
   • zones
   • campaigns
5. Detect OUTLIERS:
   • zones with cost > avg + 2×stddev
   • creatives burning disproportionately
   • zero-conversion zones with high CPC
6. Detect DEPOSIT-DRIVING zones & creatives.
7. If user asks about automation / rules / blacklists / pausing:
   👉 Output a JSON block with machine-readable rules.
   👉 JSON block must follow the exact shape requested.
   👉 The JSON block appears as the LAST part of the answer inside \`\`\`json code fences.

RULE WRITING GUIDELINES:
----------------------------------------------------------
Use ONLY these fields:
visits, conversions, revenue, cost, roi, signups, deposits (if available)

Rule types you must be able to generate:
- ZERO-conversion cost threshold rule
- Low ROI rule
- High CPA rule
- High CPC rule
- Outlier burn rule (2× stddev)
- Creative kill rule
- Zone reactivation rule (cooldown)
- Whitelist-protected zones (never pause)
- Multi-traffic-source scoped rules
- Deposit-priority rule

Reactivation example:
"IF zone was paused earlier AND zone receives 1+ signup in last 24h → Reactivate"

Whitelist example:
"IF zoneId IN ['123', '8811823'] → skip pause evaluation"

The JSON block should list:
- rules[]
- zonesToPauseNow[]
- creativesToPauseNow[]
- reactivationCandidates[]
- outlierBurners[]

REMEMBER:
If the user question is NOT about pausing/rules/automation → DO NOT output JSON.
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
     * ========================================================
     *    🚀 DETerministic Performance Analytics (Backend)
     * ========================================================
     */

    const zonesFlat: any[] = [];
    const creativesFlat: any[] = [];

    for (const c of campaigns ?? []) {
      // Zones
      for (const z of c.zones ?? []) {
        zonesFlat.push({
          campaignId: c.id,
          campaignName: c.name,
          trafficSource: c.trafficSource,
          zoneId: z.id ?? "(unknown)",
          visits: z.visits ?? 0,
          conversions: z.conversions ?? 0,
          revenue: z.revenue ?? 0,
          cost: z.cost ?? 0,
          roi: z.roi ?? 0,
        });
      }

      // Creatives
      for (const cr of c.creatives ?? []) {
        creativesFlat.push({
          campaignId: c.id,
          campaignName: c.name,
          creativeId: cr.id ?? "(unknown)",
          name: cr.name || null,
          visits: cr.visits ?? 0,
          conversions: cr.conversions ?? 0,
          revenue: cr.revenue ?? 0,
          cost: cr.cost ?? 0,
          roi: cr.roi ?? 0,
        });
      }
    }

    // Zones with conversions
    const zonesWithConversions = zonesFlat.filter(
      (z) => z.conversions > 0
    );

    // Outlier detection (2× stddev over mean cost)
    const meanCost =
      zonesFlat.reduce((s, z) => s + z.cost, 0) / (zonesFlat.length || 1);

    const stddev =
      Math.sqrt(
        zonesFlat
          .map((z) => Math.pow(z.cost - meanCost, 2))
          .reduce((s, x) => s + x, 0) / (zonesFlat.length || 1)
      ) || 0;

    const outlierThreshold = meanCost + 2 * stddev;

    const outlierBurners = zonesFlat.filter(
      (z) => z.cost > outlierThreshold && z.conversions === 0
    );

    const worstZonesNoConv = [...zonesFlat]
      .filter((z) => z.conversions === 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const topZones = [...zonesFlat]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10);

    const topCreatives = [...creativesFlat]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10);

    const worstCreativesNoConv = [...creativesFlat]
      .filter((c) => c.conversions === 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const computedContext = {
      zoneCount: zonesFlat.length,
      creativeCount: creativesFlat.length,
      meanCost,
      stddev,
      outlierThreshold,
      zonesWithConversions,
      topZones,
      worstZonesNoConv,
      worstCreativesNoConv,
      topCreatives,
      outlierBurners,
      sampleZones: zonesFlat.slice(0, 20),
      sampleCreatives: creativesFlat.slice(0, 20),
    };

    /**
     * ========================================================
     *  🚀 Prepare Messages for OpenAI
     * ========================================================
     */

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
      {
        role: "user",
        content:
          "RAW DASHBOARD DATA:\n\n" +
          JSON.stringify(
            {
              kpis,
              campaigns,
              dateRange,
              trafficSource,
              country,
            },
            null,
            2
          ),
      },
      {
        role: "user",
        content:
          "COMPUTED SUMMARY (TRUST THIS):\n\n" +
          JSON.stringify(computedContext, null, 2),
      },
    ];

    /**
     * ========================================================
     *  🚀 Call OpenAI
     * ========================================================
     */

    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages,
      temperature: 0.4,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "No answer returned from assistant.";

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
