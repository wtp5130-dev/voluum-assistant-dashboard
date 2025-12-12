import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protect every route except static assets and the sign-in page
const isProtectedRoute = createRouteMatcher([
  "/((?!_next|.*\\..*|favicon.ico|sign-in).*)",
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect(); // redirects unauthenticated users to /sign-in (satellites go to proxy)
  }
});

export const config = {
  matcher: ["/(.*)"],
};
