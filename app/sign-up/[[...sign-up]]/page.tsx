"use client";

import React from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center p-4">
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
