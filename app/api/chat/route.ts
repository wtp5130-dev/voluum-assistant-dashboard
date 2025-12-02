import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Very simple, generic chat assistant.
// This does NOT know about kpis/campaigns – it just chats.
const systemPrompt = `
You are a helpful AI assistant for the user's app.
Keep answers concise unless the user asks for detail.
`;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Support two shapes:
    // 1) { messages: [{ role, content }, ...] }  (e.g. vercel-ai useChat)
    // 2) { message: "single question string" }
    let userMessages: { role: "user" | "assistant" | "system"; content: string }[] =
      [];

    if (Array.isArray(body?.messages)) {
      userMessages = body.messages;
    } else if (typeof body?.message === "string") {
      userMessages = [{ role: "user", content: body.message }];
    } else {
      return new Response(
        JSON.stringify({ error: "Missing 'messages' or 'message' in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.5,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "No answer text returned from assistant.";

    // If your frontend expects { answer }, return that.
    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("/api/chat error:", err);
    return new Response(
      JSON.stringify({
        error: "Chat API error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
