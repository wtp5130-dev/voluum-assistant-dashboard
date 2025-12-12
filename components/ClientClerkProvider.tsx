"use client";

import { ClerkProvider, ClerkProviderProps } from "@clerk/nextjs";

export default function ClientClerkProvider({ children, ...rest }: ClerkProviderProps) {
  // Render the client-side Clerk provider to avoid calling next/headers on the server
  return <ClerkProvider {...rest}>{children}</ClerkProvider>;
}
