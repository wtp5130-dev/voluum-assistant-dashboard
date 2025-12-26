"use client";

import Link from "next/link";

export default function ThankYouPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center">✅</div>
        <h1 className="text-2xl font-semibold mb-2">Request received</h1>
        <p className="text-slate-300">BannerBot is generating your design now.</p>
        <p className="text-slate-400 mb-6">this should take a few minutes, images should appear in the Gallery in moment</p>
        <Link href="/creative-request" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-md">
          Submit another request
        </Link>
      </div>
    </main>
  );
}
