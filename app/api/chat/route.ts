// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message:
      "Chat API is alive. Send a POST request with { message: string, context?: any }.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Missing `message` in request body." },
        { status: 400 }
      );
    }

    const { message, context } = body as {
      message: string;
      context?: any;
    };

    const apiKey = process.env.OPENAI_API_KEY;

    // If you haven’t set your key yet, we still respond with 200 so the UI doesn’t “network error”
    if (!apiKey) {
      return NextResponse.json({
        reply:
          "Your backend is missing OPENAI_API_KEY. Add it in Vercel → Project Settings → Environment Variables.",
      });
    }

    // Call OpenAI (you can change model if you like)
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a Voluum / campaign optimization assistant. Be concise and practical.",
            },
            {
              role: "user",
              content: message,
            },
            ...(context
              ? [
                  {
                    role: "system" as const,
                    content:
                      "Context JSON (do not echo verbatim, just use it): " +
                      JSON.stringify(context),
                  },
                ]
              : []),
          ],
        }),
      }
    );

    if (!openaiRes.ok) {
      const text = await openaiRes.text().catch(() => "");
      console.error("OpenAI error", openaiRes.status, text);

      return NextResponse.json(
        { error: "Upstream LLM error. Check server logs for details." },
        { status: 500 }
      );
    }

    const data = (await openaiRes.json()) as any;
    const reply =
      data.choices?.[0]?.message?.content?.trim() ??
      "I couldn’t generate a reply.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API POST error", err);
    return NextResponse.json(
      { error: "Internal server error in /api/chat." },
      { status: 500 }
    );
  }
}
