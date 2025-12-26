"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ThankYouPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-4">
      {!done ? (
        <div className="w-full max-w-md text-center">
          {/* Shimmer loader */}
          <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 animate-pulse" />
          <p className="mt-6 text-slate-600">Finalizing your request…</p>
        </div>
      ) : (
        <div className="w-full max-w-lg text-center">
          <h1 className="text-3xl font-semibold text-[#111827] mb-2">✅ Request Received!</h1>
          <p className="text-slate-600 mb-6">
            BannerBot is generating your design now — you’ll see your task appear in ClickUp shortly.
          </p>
          <Link
            href="/creative-request"
            className="inline-flex items-center gap-2 bg-[#0070f3] hover:bg-[#0060d4] text-white px-5 py-2.5 rounded-md"
          >
            Submit Another Request
          </Link>
        </div>
      )}
    </div>
  );
}
