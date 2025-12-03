// app/api/chat/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type DashboardMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatBody = {
  // Shape A (simple)
  message?: string;
  context?: any;

  // Shape B (dashboard)
  messages?: DashboardMessage[];
  kpis?: any;
  campaigns?: any;
  dateRange?: {
    label?: string;
    from?: string;
    to?: string;
  };
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  return json({
    message:
      "Chat API is alive. Send a POST request with { message: string, context?: any } or { messages, kpis, campaigns, dateRange }.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatBody;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({
        reply:
          "Backend is missing OPENAI_API_KEY. Set it in your Vercel / .env.local environment variables.",
      });
    }

    const { message, context, messages, kpis, campaigns, dateRange } = body;

    // Try to figure out the latest user question
    let latestUserMessage: string | undefined = message;

    if (!latestUserMessage && Array.isArray(messages) && messages.length > 0) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      latestUserMessage = lastUser?.content;
    }

    if (!latestUserMessage) {
      latestUserMessage = "Help me analyze my Voluum campaigns, zones, and creatives.";
    }

    // Build a compact context summary for the model
    const contextSummary = `
You are an assistant helping to analyze Voluum performance data (PropellerAds traffic, casino / betting offers).

Date range: ${dateRange?.label ?? "custom"} (${
      dateRange?.from ?? "?"
    } → ${dateRange?.to ?? "?"})

KPIs:
${
  Array.isArray(kpis)
    ? kpis.map((k: any) => `- ${k.label}: ${k.value}`).join("\n")
    : "N/A"
}

Campaigns loaded: ${Array.isArray(campaigns) ? campaigns.length : 0}

Guidelines:
- Look at zones and creatives with high spend and zero/low signups or deposits.
- Suggest rules like "pause zone if spend > X and conversions = 0" or "scale zones with good ROI".
- Be concrete and actionable: reference specific campaign names and zone IDs when possible.
`.trim();

    // Build OpenAI messages
    const openAIMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: contextSummary,
      },
    ];

    if (Array.isArray(messages) && messages.length > 0) {
      // Reuse dashboard chat history if present
      for (const m of messages) {
        if (m.role === "user" || m.role === "assistant" || m.role === "system") {
          openAIMessages.push({ role: m.role, content: m.content });
        }
      }
    } else if (latestUserMessage) {
      // Fallback: just send the latest single message
      const combined = context
        ? `User message:\n${latestUserMessage}\n\nExtra context JSON:\n${JSON.stringify(
            context,
            null,
            2
          )}`
        : latestUserMessage;

      openAIMessages.push({
        role: "user",
        content: combined,
      });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: openAIMessages,
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const text = await openaiResponse.text();
      console.error("OpenAI error:", openaiResponse.status, text);
      return json({
        reply: `I couldn't generate a suggestion right now (OpenAI error ${openaiResponse.status}). Details: ${text.slice(
          0,
          300
        )}`,
      });
    }

    const data = await openaiResponse.json();
    const reply: string =
      data?.choices?.[0]?.message?.content ??
      "I’m not sure what to say — try asking your question another way?";

    return json({ reply });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return json({
      reply:
        "Something went wrong inside `/api/chat`. Error: " +
        (err?.message ?? String(err)),
    });
  }
}
