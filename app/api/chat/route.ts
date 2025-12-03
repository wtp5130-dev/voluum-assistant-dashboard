// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // optional, but good for latency

type ChatRequestBody = {
  message: string;
  context?: unknown;
};

// Helper to build JSON responses
function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(
        {
          error: "Missing OPENAI_API_KEY on the server.",
        },
        500
      );
    }

    let body: ChatRequestBody;
    try {
      body = (await req.json()) as ChatRequestBody;
    } catch {
      return json(
        {
          error: "Invalid JSON body.",
        },
        400
      );
    }

    if (!body.message || typeof body.message !== "string") {
      return json(
        {
          error: "Request body must include a 'message' string.",
        },
        400
      );
    }

    const systemPrompt = `
You are a Voluum and PropellerAds performance assistant.
- You receive a 'message' from the user.
- Optionally you may receive some 'context' JSON with KPIs, campaigns, zones, creatives.
- Explain things clearly and make specific, actionable suggestions.
- The user is running casino / betting offers and wants help improving performance.
    `.trim();

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  body.context != null
                    ? `User message:\n${body.message}\n\nContext JSON:\n${JSON.stringify(
                        body.context,
                        null,
                        2
                      )}`
                    : body.message,
              },
            ],
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return json(
        {
          error: "OpenAI API returned an error.",
          status: openaiResponse.status,
          details: errorText,
        },
        500
      );
    }

    const data = await openaiResponse.json();

    const reply =
      data?.choices?.[0]?.message?.content ??
      "Sorry, I couldn't generate a reply from the AI.";

    return json({ reply });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return json(
      {
        error: "Unexpected server error in /api/chat.",
        details: err?.message ?? String(err),
      },
      500
    );
  }
}

// Optionally handle GET so you can quickly test in the browser
export async function GET() {
  return json({
    message:
      "Chat API is alive. Send a POST request with { message: string, context?: any }.",
  });
}
