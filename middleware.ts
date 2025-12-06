import { NextRequest, NextResponse } from "next/server";

async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
      enc.encode(payloadB64)
    );
    if (!valid) return false;
    const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    // optional: check expiry (7 days)
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (!json?.t || Date.now() - Number(json.t) > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Allow login page and static assets
  if (pathname === "/login") return NextResponse.next();

  const session = req.cookies.get("session")?.value;
  const secret = process.env.AUTH_SECRET || "dev-secret";

  const ok = session ? await verifyToken(session, secret) : false;
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = search ? `?callbackUrl=${encodeURIComponent(pathname + search)}` : `?callbackUrl=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Protect all routes except api, static, and login
    "/((?!api|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
