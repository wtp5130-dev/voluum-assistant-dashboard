import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const KEY = "auth:users";

type Perms = { dashboard: boolean; optimizer: boolean; creatives: boolean; builder: boolean };

type UserRec = { username?: string; email?: string; role: "admin" | "user"; hash?: string; perms: Perms };

export async function GET() {
  // Prefer NextAuth session (Google OAuth)
  const nas = await getServerSession(authOptions).catch(() => null);
  const username = nas?.user?.email || null;
  if (!username) return NextResponse.json({ user: null }, { status: 200 });

  const list = (await kv.get(KEY)) as UserRec[] | null;
  if (Array.isArray(list)) {
    const rec = list.find((u) => u.username === username || u.email === username);
    if (rec) {
      return NextResponse.json({ user: { username: rec.email || rec.username || username, role: rec.role, perms: rec.perms } });
    }
  }

  // Fallback env admin
  if (username === (process.env.AUTH_USERNAME || "admin")) {
    return NextResponse.json({ user: { username, role: "admin", perms: { dashboard: true, optimizer: true, creatives: true, builder: true } } });
  }

  return NextResponse.json({ user: { username, role: "user", perms: { dashboard: true, optimizer: false, creatives: false, builder: false } } });
}
