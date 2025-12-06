import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

function b64url(input: string) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = (body?.username || "").toString();
    const password = (body?.password || "").toString();

    const expectedUser = process.env.AUTH_USERNAME || "admin";
    const expectedPass = process.env.AUTH_PASSWORD || "password";
    const secret = process.env.AUTH_SECRET || "dev-secret";

    // 1) Try KV users
    const list = (await kv.get("auth:users")) as any[] | null;
    let ok = false;
    if (Array.isArray(list)) {
      const urec = list.find((u) => u.username === username);
      if (urec && urec.hash) {
        const enc = new TextEncoder();
        const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:${password}`));
        const hashB64 = Buffer.from(new Uint8Array(hashBuf)).toString("base64");
        if (hashB64 === urec.hash) ok = true;
      }
    }

    // 2) Fallback to env admin
    if (!ok) {
      if (!(username === expectedUser && password === expectedPass)) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
    }

    // Create signed token: base64url(payload).base64(signature)
    const payload = { u: username, t: Date.now() };
    const payloadB64 = b64url(JSON.stringify(payload));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const sigB64 = Buffer.from(sigBuf).toString("base64");
    const token = `${payloadB64}.${sigB64}`;

    const res = NextResponse.json({ ok: true });
    res.cookies.set("session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
