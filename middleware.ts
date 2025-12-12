import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Protect every route except static assets and the sign-in page
const isProtectedRoute = createRouteMatcher([
  "/((?!_next|.*\\..*|favicon.ico|sign-in).*)",
]);

export default clerkMiddleware((auth, req) => {
  // Soft-guard: if Clerk env keys are missing, do not crash middleware
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  if (!pk || !sk) {
    return NextResponse.next();
  }
  if (isProtectedRoute(req)) {
    try {
      auth().protect();
    } catch (e) {
      // Fallback: manually redirect to sign-in; satellites will forward to proxy
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(url);
    }
  }
});

export const config = {
  matcher: ["/(.*)"],
};
