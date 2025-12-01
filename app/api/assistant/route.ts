// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

type DateRangeKey = "today" | "yesterday" | "last7days";

// Simple GET to test the route in a browser
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

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is missing. Set it in .env.local (project root) and in Vercel.",
        },
        { status: 500 }
      );
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body in request." },
        { status: 400 }
      );
    }

    const {
      question,
      kpis,
      campaigns,
      dateRange,
      trafficSource,
      country,
    } = body || {};

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Missing 'question' in request body." },
        { status: 400 }
      );
    }

    const safeDateRange: DateRangeKey | undefined =
      dateRange === "today" || dateRange === "yesterday" || dateRange === "last7days"
        ? dateRange
        : undefined;

    const topCampaigns = Array.isArray(campaigns)
      ? campaigns.slice(0, 30)
      : [];
    const safeKpis = Array.isArray(kpis) ? kpis : [];

    const summaryContext = {
      dateRange: safeDateRange,
      trafficSource,
      country,
      kpis: safeKpis,
      campaigns: topCampaigns.map((c: any) => ({
        name: c.name,
        trafficSource: c.trafficSource,
        visits: Number(c.visits ?? 0),
        signups: Number(c.signups ?? 0),
        deposits: Number(c.deposits ?? 0),
        revenue: Number(c.revenue ?? 0),
        profit: Number(c.profit ?? 0),
        roi: Number(c.roi ?? 0),
        cpa: Number(c.cpa ?? 0),
        cpr: Number(c.cpr ?? 0),
      })),
    };

    const systemPrompt = `
You are a senior performance marketing analyst.
You analyze Voluum campaign stats and explain what to do in clear, practical language.

Rules:
- Focus on actionable advice (pause, scale, test, adjust bids, change creatives, etc).
- Be concise: 3–6 short bullet points is ideal.
- Respect the user's current filters: date range, traffic source, country.
- Use the stats given; don't invent exact numbers that are not in the context.
- If all campaigns are losing, say that honestly and suggest what to tweak.
- If there is very little data, say that it's too early to make strong decisions.
    `.trim();

    const userPrompt = `
User question:
${question}

Context (JSON):
${JSON.stringify(summaryContext, null, 2)}
    `.trim();

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 400,
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "I couldn't generate an answer based on the provided data.";

    return NextResponse.json(
      {
        answer,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Assistant API error:", err);
    return NextResponse.json(
      {
        error: "Error calling OpenAI assistant.",
        message: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
