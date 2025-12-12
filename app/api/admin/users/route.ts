import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { cookies } from "next/headers";

const KEY = "auth:users";

type Perms = {
  dashboard: boolean;
  optimizer: boolean;
  creatives: boolean;
  builder: boolean;
  sidekick?: boolean;
  roadmap?: boolean;
  whatsapp?: boolean;
};

type UserRec = { username: string; role: "admin" | "user"; hash: string; perms: Perms; createdAt?: string; lastLogin?: string };

function b64(input: ArrayBuffer) {
  return Buffer.from(new Uint8Array(input)).toString("base64");
}

async function sha256(input: string) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return b64(buf);
}

function parseToken(token: string | undefined) {
  if (!token) return null;
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const json = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    return json?.u || null;
  } catch {
    return null;
  }
}

async function isAdminUser(username: string | null): Promise<boolean> {
  if (!username) return false;
  if (username === (process.env.AUTH_USERNAME || "admin")) return true;
  const list: UserRec[] = (await kv.get(KEY)) as any;
  if (!Array.isArray(list)) return false;
  return !!list.find((u) => u.username === username && u.role === "admin");
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const username = parseToken(session);
  if (!(await isAdminUser(username))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const list: UserRec[] = (await kv.get(KEY)) as any;
  const users = (Array.isArray(list) ? list : []).map((u) => ({ username: u.username, role: u.role, perms: u.perms, createdAt: u.createdAt || null, lastLogin: u.lastLogin || null }));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const username = parseToken(session);
  if (!(await isAdminUser(username))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const u = (body?.username || "").toString();
  const p = body?.password ? (body.password as string).toString() : "";
  const role = (body?.role || "user").toString() as "admin" | "user";
  const permsBody = body?.perms as Partial<Perms> | undefined;
  if (!u) return NextResponse.json({ error: "username required" }, { status: 400 });
  const secret = process.env.AUTH_SECRET || "dev-secret";
  const list: UserRec[] = (await kv.get(KEY)) as any;
  const arr = Array.isArray(list) ? list : [];
  const existing = arr.findIndex((x) => x.username === u);
  const defaultPerms: Perms = { dashboard: true, optimizer: false, creatives: false, builder: false, sidekick: true, roadmap: false, whatsapp: false };
  const targetPerms: Perms = {
    ...(existing >= 0 ? arr[existing].perms : defaultPerms),
    ...(permsBody || {}),
  } as Perms;

  if (existing >= 0) {
    let nextHash = arr[existing].hash;
    if (p) {
      nextHash = await sha256(`${secret}:${p}`);
    }
    arr[existing] = { username: u, role, hash: nextHash, perms: targetPerms, createdAt: arr[existing].createdAt || new Date().toISOString(), lastLogin: arr[existing].lastLogin || null };
  } else {
    if (!p) return NextResponse.json({ error: "password required for new user" }, { status: 400 });
    const hash = await sha256(`${secret}:${p}`);
    arr.unshift({ username: u, role, hash, perms: targetPerms, createdAt: new Date().toISOString(), lastLogin: null });
  }
  await kv.set(KEY, arr);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const username = parseToken(session);
  if (!(await isAdminUser(username))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const u = searchParams.get("username");
  if (!u) return NextResponse.json({ error: "username required" }, { status: 400 });
  if (u === (process.env.AUTH_USERNAME || "admin")) {
    return NextResponse.json({ error: "cannot delete primary admin" }, { status: 400 });
  }
  const list: UserRec[] = (await kv.get(KEY)) as any;
  const arr = Array.isArray(list) ? list : [];
  const next = arr.filter((x) => x.username !== u);
  await kv.set(KEY, next);
  return NextResponse.json({ ok: true });
}
