"use client";

import React from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center p-4">
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
