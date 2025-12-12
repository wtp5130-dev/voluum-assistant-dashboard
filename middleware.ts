export { authMiddleware } from "@clerk/nextjs";

export const config = {
  matcher: [
    "/((?!_next|.*\\..*|favicon.ico|sign-in).*)",
  ],
};
