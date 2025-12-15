"use client";

import React from "react";
import { ClerkProvider } from "@clerk/nextjs";

type Props = {
  children: React.ReactNode;
};

export default function ClientClerkProvider({ children }: Props) {
  // If Clerk isn't configured, no-op so app falls back to legacy auth
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!hasClerk) return <>{children}</>;

  // Render Clerk provider when configured
  return <ClerkProvider>{children}</ClerkProvider>;
}
