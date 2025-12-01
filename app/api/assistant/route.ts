import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/assistant
 *
 * This takes the dashboard data (campaigns, KPIs, date range, etc.)
 * + the user's question, and asks OpenAI for a marketing analysis.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is missing. Set it in .env.local (project root) and in Vercel if deployed.",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json();

    const {
      question,
      kpis,
      campaigns,
      dateRange,
      trafficSource,
      country,
    } = body || {};

    // Keep KPIs and date range as-is (or empty)
    const safeKpis = kpis || {};
    const safeDateRange = dateRange || null;

    // Limit the number of campaigns we send to the model (for token cost)
    const topCampaigns = Array.isArray(campaigns)
      ? campaigns.slice(0, 30)
      : [];

    /**
     * Prepare a compact JSON context.
     * If, later, you add zones/creatives to each campaign, they will be included.
     */
    const summaryContext = {
      dateRange: safeDateRange,
      trafficSource: trafficSource || null,
      country: country || null,
      kpis: safeKpis,
      campaigns: (topCampaigns || []).map((c: any) => ({
        name: c.name,
        id: c.id,
        trafficSource: c.trafficSource,
        visits: Number(c.visits ?? 0),
        signups: Number(c.signups ?? 0),
        deposits: Number(c.deposits ?? 0),
        revenue: Number(c.revenue ?? 0),
        profit: Number(c.profit ?? 0),
        roi: Number(c.roi ?? 0),
        cost: Number(c.cost ?? 0),
        cpa: Number(c.cpa ?? 0),
        cpr: Number(c.cpr ?? 0),

        // If later you add zones/creatives to your dashboard data,
        // they will be passed through to the model here.
        zones: (c.zones || []).map((z: any) => ({
          id: String(z.id ?? z.zoneId ?? "unknown"),
          visits: Number(z.visits ?? 0),
          conversions: Number(z.conversions ?? 0),
          revenue: Number(z.revenue ?? 0),
          cost: Number(z.cost ?? 0),
          roi: Number(z.roi ?? 0),
        })),

        creatives: (c.creatives || []).map((cr: any) => ({
          id: String(cr.id ?? cr.creativeId ?? "unknown"),
          name: cr.name,
          visits: Number(cr.visits ?? 0),
          conversions: Number(cr.conversions ?? 0),
          revenue: Number(cr.revenue ?? 0),
          cost: Number(cr.cost ?? 0),
          roi: Number(cr.roi ?? 0),
        })),
      })),
    };

    /**
     * This tells the model HOW to speak.
     * We explicitly ask for Markdown, headings, and bullet points.
     * We also tell it to reference zones/creatives when present.
     */
    const systemPrompt = `
You are a senior performance marketing analyst for online casino and sweepstakes offers.
You analyze Voluum campaign stats and explain what to do in clear, practical language.

Formatting:
- ALWAYS format the entire answer in Markdown.
- Start with a short **Summary** section (2–3 bullet points).
- Then use section headings like:
  - "### Campaigns to Scale"
  - "### Campaigns to Pause or Fix"
  - "### Zone Actions"
  - "### Creative Actions"
- Use bullet lists, not long paragraphs.
- Keep the total answer to something that fits on one screen (no novels).

Rules:
- When zone data is present, call out specific **zone IDs** to blacklist, bid down, or scale.
- When creative data is present, call out specific **creative IDs** (and names if available) to pause or scale.
- Focus on actionable advice: pause, scale, test, adjust bids, change creatives, tweak targeting.
- Respect the user's current filters: date range, traffic source, country.
- Use the stats given; don't invent exact numbers that are not in the context.
- If all campaigns are losing, say that honestly and suggest what to tweak.
- If there is very little data, say that it's too early to make strong decisions, and suggest minimum data thresholds.
`.trim();

    const userPrompt = `
User question:
${question || "(no question provided)"}

Context (JSON):
${JSON.stringify(summaryContext, null, 2)}
`.trim();

    // Call OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini", // fast + cheap, good for this use case
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 400,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "Sorry, I couldn't generate an answer based on the data I received.";

    // Return the answer to the frontend
    return NextResponse.json({
      answer,
      summaryContext,
    });
  } catch (err: any) {
    console.error("Error in /api/assistant:", err);

    return NextResponse.json(
      {
        error: "Error calling OpenAI assistant.",
        message: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/assistant
 *
 * Simple health check so you can open /api/assistant in the browser
 * and see if OPENAI_API_KEY is detected.
 */
export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY;

  return NextResponse.json(
    {
      status: hasKey ? "ok" : "error",
      hasOpenAIKey: hasKey,
      message: hasKey
        ? "Assistant API is up. Use POST with a question."
        : "OPENAI_API_KEY is missing. Set it in .env.local and in Vercel.",
    },
    { status: hasKey ? 200 : 500 }
  );
}
