import { cookies } from "next/headers";
import { kv } from "@vercel/kv";

export type PermKey = "dashboard" | "optimizer" | "creatives" | "builder";

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

export async function getCurrentUser(): Promise<{ username: string; role: "admin" | "user"; perms: Perms } | null> {
  const store = await cookies();
  const session = store.get("session")?.value;
  const username = parseToken(session);
  if (!username) return null;

  const list = (await kv.get("auth:users")) as UserRec[] | null;
  if (Array.isArray(list)) {
    const rec = list.find((u) => u.username === username);
    if (rec) return { username: rec.username, role: rec.role, perms: rec.perms };
  }

  if (username === (process.env.AUTH_USERNAME || "admin")) {
    return { username, role: "admin", perms: { dashboard: true, optimizer: true, creatives: true, builder: true } };
  }

  return { username, role: "user", perms: { dashboard: true, optimizer: false, creatives: false, builder: false } };
}

export async function requirePermission(key: PermKey): Promise<boolean> {
  const u = await getCurrentUser();
  if (!u) return false;
  if (u.role === "admin") return true;
  return !!u.perms?.[key];
}
