"use client";

import { useState, useEffect, Suspense } from "react";
import CreativeRequestForm from "@/components/CreativeRequestForm";
import CreativeGallery from "@/components/CreativeGallery";

export const dynamic = "force-dynamic";

export default function CreativeRequestPage() {
  const [tab, setTab] = useState<"request" | "gallery">("request");
  useEffect(() => {
    try {
      const usp = new URLSearchParams(window.location.search);
      const v = usp.get("view");
      if (v === "gallery") setTab("gallery");
    } catch {}
  }, []);

  const setUrl = (v: "request" | "gallery") => {
    try {
      const url = new URL(window.location.href);
      if (v === "request") url.searchParams.delete("view"); else url.searchParams.set("view", v);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 inline-flex items-center rounded-full border border-slate-800 bg-slate-900/70 p-1 text-[12px]">
          <button onClick={() => { setTab("request"); setUrl("request"); }} className={`px-4 py-1.5 rounded-full ${tab==='request' ? 'bg-emerald-500 text-slate-900' : 'text-slate-200 hover:bg-slate-800'}`}>Request Creative</button>
          <button onClick={() => { setTab("gallery"); setUrl("gallery"); }} className={`px-4 py-1.5 rounded-full ${tab==='gallery' ? 'bg-emerald-500 text-slate-900' : 'text-slate-200 hover:bg-slate-800'}`}>Gallery</button>
        </div>

        {tab === "request" ? (
          <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-slate-200">Loading form…</div>}>
            <CreativeRequestForm />
          </Suspense>
        ) : (
          <CreativeGallery />
        )}
      </div>
    </main>
  );
}
