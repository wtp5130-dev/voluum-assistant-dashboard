import type { NextRequest } from "next/server";

export const runtime = "nodejs"; // or "edge" if you prefer, but node is fine here

type DashboardMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestBody = {
  messages: DashboardMessage[];
  kpis?: any;
  campaigns?: any;
  dateRange?: {
    label?: string;
    from?: string;
    to?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    const { messages = [], kpis, campaigns, dateRange } = body;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // If you haven’t wired your key yet, at least return a helpful reply
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          reply:
            "The chat backend isn’t configured yet. Please set OPENAI_API_KEY in your Vercel / .env.local environment variables.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const latestUserMessage =
      messages[messages.length - 1]?.content || "Help me with my campaigns.";

    // Build a compact summary of context so the model can reason about it
    const contextSummary = `
You are an assistant helping to analyze Voluum performance data for ads.

Date range: ${dateRange?.label ?? "custom"} (${dateRange?.from ?? "?"} → ${
      dateRange?.to ?? "?"
    })

Key KPIs:
${Array.isArray(kpis) ? kpis.map((k) => `- ${k.label}: ${k.value}`).join("\n") : "N/A"}

There are ${Array.isArray(campaigns) ? campaigns.length : 0} campaigns loaded.
For each campaign there may be:
- zones: zone-level performance
- creatives: creative-level performance
Some items may have id="" which means traffic without a tracked zone/creative.

The user’s latest question is: "${latestUserMessage}"

When asked for “automation rules for bad performing zones”, think like a media buyer:
- Find zones with high spend and no conversions or very low signups/deposits
- Suggest pausing zone IDs at the traffic source (PropellerAds)
- Suggest threshold-based rules (e.g., pause zone if spend > X and conversions = 0).
Respond with clear, concise recommendations and reference zone IDs / campaign names where helpful.
`.trim();

    // Compose messages for OpenAI
    const openAIMessages = [
      {
        role: "system" as const,
        content: contextSummary,
      },
      // Include prior chat history if provided
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini", // good cheap model; change if you want
          messages: openAIMessages,
          temperature: 0.3,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const text = await openaiResponse.text();
      console.error("OpenAI error:", openaiResponse.status, text);
      return new Response(
        JSON.stringify({
          reply:
            "I couldn’t generate a suggestion right now (OpenAI error). Please try again in a bit.",
        }),
        {
          status: 200, // still 200 so the frontend doesn't treat as network error
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const completion = await openaiResponse.json();
    const reply =
      completion?.choices?.[0]?.message?.content ??
      "I’m not sure what to say — try asking in a different way?";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        reply:
          "Something went wrong on the chat backend. Check the `/api/chat` logs in Vercel.",
      }),
      {
        status: 200, // again, so your frontend shows the text instead of a generic error
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
