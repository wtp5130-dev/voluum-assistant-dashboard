import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const USERS_KEY = "auth:users";

function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const [payloadB64] = token.split(".");
    const json = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    return json?.u || null;
  } catch {
    return null;
  }
}

function hostToAppKey(host: string): "sidekick" | "roadmap" | "whatsapp" | "sidekick" {
  const h = host.toLowerCase();
  if (h.includes("roadmap")) return "roadmap";
  if (h.includes("whatsapp")) return "whatsapp";
  return "sidekick";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // Public paths
  const PUBLIC = [/^\/_next\//, /\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/i, /^\/favicon\.ico$/, /^\/login$/, /^\/api\/auth\//, /^\/marketing(\/.*)?$/];
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // This project is the Sidekick app, deployed on sidekick.projectx.to (or any subdomain you assign).
  // No host-based rewrites here; apex/homepage lives in a separate project.

  // Require session cookie
  const session = req.cookies.get("session")?.value;
  const username = parseToken(session);
  if (!username) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Enforce app-level permission per host
  let allowed = false;
  try {
    const list = (await kv.get(USERS_KEY)) as any[] | null;
    const appKey = hostToAppKey(host);
    if (Array.isArray(list)) {
      const rec = list.find((u) => u.username === username);
      const admin = rec?.role === "admin" || username === (process.env.AUTH_USERNAME || "admin");
      const perms = rec?.perms || {};
      allowed = admin || Boolean(perms[appKey] ?? (appKey === "sidekick"));
    } else {
      // Fallback: allow admin, allow sidekick by default
      const admin = username === (process.env.AUTH_USERNAME || "admin");
      const appKey = hostToAppKey(host);
      allowed = admin || appKey === "sidekick";
    }
  } catch {
    // If KV fails, allow but still require login
    allowed = true;
  }

  if (!allowed) {
    try {
      const audit = { id: crypto.randomUUID(), ts: new Date().toISOString(), category: "auth", action: "access_denied", username, host, path: pathname };
      await kv.lpush("audit:events", audit);
      await kv.ltrim("audit:events", 0, 999);
    } catch {}
    const url = new URL("/no-access", req.url);
    url.searchParams.set("app", hostToAppKey(host));
    return NextResponse.redirect(url);
  }

  try {
    const audit = { id: crypto.randomUUID(), ts: new Date().toISOString(), category: "auth", action: "access_granted", username, host, path: pathname };
    await kv.lpush("audit:events", audit);
    await kv.ltrim("audit:events", 0, 999);
  } catch {}

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|.*\\..*|favicon.ico).*)",
  ],
};
