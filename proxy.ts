import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes (no auth required). Add more as needed.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login', // legacy login fallback
  '/api/health',
  '/favicon.ico',
]);

export default clerkMiddleware((auth, req) => {
  // If Clerk keys are missing, bypass (prevents build/runtime crashes)
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  if (!pk || !sk) return;

  if (isPublicRoute(req)) return; // Allow public routes

  // Protect everything else
  auth().protect();
}, {
  // Satellite/primary configuration via env
  isSatellite: process.env.NEXT_PUBLIC_CLERK_IS_SATELLITE === 'true',
  signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || 'https://auth.projectx.to/sign-in',
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
