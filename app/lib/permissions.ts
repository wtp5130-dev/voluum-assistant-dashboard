import { cookies } from "next/headers";
import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export type PermKey = "dashboard" | "optimizer" | "creatives" | "builder" | "sidekick" | "roadmap" | "whatsapp";

type Perms = { dashboard: boolean; optimizer: boolean; creatives: boolean; builder: boolean; sidekick?: boolean; roadmap?: boolean; whatsapp?: boolean };
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
  // 1) Prefer NextAuth session (Google OAuth)
  try {
    const nas = await getServerSession(authOptions).catch(() => null);
    const oauthEmail = nas?.user?.email || null;
    if (oauthEmail) {
      const list = (await kv.get("auth:users")) as UserRec[] | null;
      if (Array.isArray(list)) {
        const rec = list.find((u) => u.email === oauthEmail || u.username === oauthEmail);
        if (rec) return { username: rec.email || rec.username, role: rec.role, perms: rec.perms } as any;
      }
      if (oauthEmail === (process.env.AUTH_USERNAME || "admin")) {
        return {
          username: oauthEmail,
          role: "admin",
          perms: { dashboard: true, optimizer: true, creatives: true, builder: true, sidekick: true, roadmap: true, whatsapp: true },
        };
      }
      // Default perms for authenticated non-admin if no record in KV
      return {
        username: oauthEmail,
        role: "user",
        perms: { dashboard: true, optimizer: false, creatives: false, builder: false, sidekick: true, roadmap: false, whatsapp: false },
      };
    }
  } catch {}

  // 2) Fallback to legacy cookie token
  const store = await cookies();
  const session = store.get("session")?.value;
  const username = parseToken(session);
  if (!username) return null;

  const list = (await kv.get("auth:users")) as UserRec[] | null;
  if (Array.isArray(list)) {
    const rec = list.find((u) => u.username === username || u.email === username);
    if (rec) return { username: rec.email || rec.username, role: rec.role, perms: rec.perms } as any;
  }

  if (username === (process.env.AUTH_USERNAME || "admin")) {
    return { username, role: "admin", perms: { dashboard: true, optimizer: true, creatives: true, builder: true, sidekick: true, roadmap: true, whatsapp: true } };
  }

  return { username, role: "user", perms: { dashboard: true, optimizer: false, creatives: false, builder: false, sidekick: true, roadmap: false, whatsapp: false } };
}

export async function requirePermission(key: PermKey): Promise<boolean> {
  const u = await getCurrentUser();
  if (!u) return false;
  if (u.role === "admin") return true;
  return !!u.perms?.[key];
}
