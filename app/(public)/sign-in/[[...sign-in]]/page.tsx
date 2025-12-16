"use client";
import { signIn } from "next-auth/react";

export default function Page() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="text-sm px-4 py-2 rounded-md bg-white text-slate-900 hover:bg-slate-200"
      >
        Continue with Google
      </button>
    </div>
  );
}
