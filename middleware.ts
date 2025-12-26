import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { getToken } from "next-auth/jwt";

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

// This project only serves sidekick.projectx.to. Keep a single app key: "sidekick".

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // Public paths
    const PUBLIC = [
      /^\/_next\//,
      /\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/i,
      /^\/favicon\.ico$/,
      /^\/login$/,
      /^\/api\/auth\//,
      /^\/marketing(\/.*)?$/,
      // Public APIs for external services (ClickUp integration)
      /^\/api\/clickup-webhook(?:\/.*)?$/,
      /^\/api\/create-banner-task(?:\/.*)?$/,
    ];
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // This project is the Sidekick app, deployed on sidekick.projectx.to only.

  // Try NextAuth JWT first, then fallback to legacy session cookie
  let username: string | null = null;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token && (token as any).email) {
      username = String((token as any).email);
    }
  } catch {}
  if (!username) {
    const session = req.cookies.get("session")?.value;
    username = parseToken(session);
  }
  if (!username) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Enforce app-level permission for Sidekick only
  let allowed = false;
  try {
    const list = (await kv.get(USERS_KEY)) as any[] | null;
    if (Array.isArray(list)) {
      const rec = list.find((u) => (u.username === username) || (u.email === username));
      const admin = rec?.role === "admin" || username === (process.env.AUTH_USERNAME || "admin");
      const perms = rec?.perms || {};
      // Allow admins or users with sidekick permission. Default to true if unspecified to avoid lockout.
      allowed = admin || Boolean(perms.sidekick ?? true);
    } else {
      // Fallback: allow admin; otherwise allow by default for Sidekick
      const admin = username === (process.env.AUTH_USERNAME || "admin");
      allowed = admin || true;
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
    // Exclude static assets and public API endpoints from middleware
    "/((?!_next|.*\\..*|favicon.ico|api/clickup-webhook|api/create-banner-task).*)",
  ],
};
