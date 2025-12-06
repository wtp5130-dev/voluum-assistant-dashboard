import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { cookies } from "next/headers";

const KEY = "auth:users";

type Perms = { dashboard: boolean; optimizer: boolean; creatives: boolean; builder: boolean };

type UserRec = { username: string; role: "admin" | "user"; hash: string; perms: Perms };

function parseToken(token: string | undefined) {
  if (!token) return null;
  try {
    const [payloadB64] = token.split(".");
    const json = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    return json?.u || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const username = parseToken(session);
  if (!username) return NextResponse.json({ user: null }, { status: 200 });

  const list = (await kv.get(KEY)) as UserRec[] | null;
  if (Array.isArray(list)) {
    const rec = list.find((u) => u.username === username);
    if (rec) {
      return NextResponse.json({ user: { username: rec.username, role: rec.role, perms: rec.perms } });
    }
  }

  // Fallback env admin
  if (username === (process.env.AUTH_USERNAME || "admin")) {
    return NextResponse.json({ user: { username, role: "admin", perms: { dashboard: true, optimizer: true, creatives: true, builder: true } } });
  }

  return NextResponse.json({ user: { username, role: "user", perms: { dashboard: true, optimizer: false, creatives: false, builder: false } } });
}
