"use client";

import React from "react";
import { ClerkProvider } from "@clerk/nextjs";

type Props = {
  children: React.ReactNode;
};

export default function ClientClerkProvider({ children }: Props) {
  // Render the client-side Clerk provider to avoid calling next/headers on the server
  return <ClerkProvider>{children}</ClerkProvider>;
}
