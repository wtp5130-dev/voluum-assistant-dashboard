"use client";

import Link from "next/link";
import React from "react";

export default function ThankYouPage() {
  const [progress, setProgress] = React.useState(0);
  const steps = React.useMemo(
    () => [
      { pct: 5, label: "Queued" },
      { pct: 20, label: "Preparing prompt" },
      { pct: 55, label: "Generating variations" },
      { pct: 80, label: "Upscaling & compressing" },
      { pct: 95, label: "Uploading to Gallery" },
      { pct: 100, label: "Completed" },
    ],
    []
  );

  React.useEffect(() => {
    let pct = 0;
    const tick = () => {
      // ease to 95%, then finalize to 100% after a short delay
      const max = pct < 90 ? 95 : 100;
      const step = Math.max(1, Math.round(Math.random() * (pct < 60 ? 7 : 4)));
      pct = Math.min(max, pct + step);
      setProgress(pct);
      if (pct < 95) {
        timer = setTimeout(tick, 400 + Math.random() * 500);
      } else if (pct < 100) {
        timer = setTimeout(() => {
          pct = 100;
          setProgress(100);
        }, 2500 + Math.random() * 2000);
      }
    };
    let timer: any = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, []);

  const current = steps.find((s) => progress <= s.pct) || steps[steps.length - 1];

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-lg text-center">
        <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${progress === 100 ? "bg-emerald-600" : "bg-slate-700"}`}>
          {progress === 100 ? "✅" : "⏳"}
        </div>
        <h1 className="text-2xl font-semibold mb-2">Request received</h1>
        <p className="text-slate-300">BannerBot is generating your design now.</p>
        <p className="text-slate-400 mb-6">This may take a few minutes. Images will appear in the Gallery when ready.</p>

        {/* Progress bar */}
        <div className="text-left bg-slate-900/70 border border-slate-800 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-[12px] text-slate-300 mb-1">
            <span>{current.label}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {progress === 100 && (
          <div className="text-emerald-300 text-sm mb-2">Your design is ready in the Gallery.</div>
        )}

        <div className="flex items-center justify-center gap-3">
          <Link href="/creative-request" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-md">
            Submit another request
          </Link>
          <Link
            href="/creative-request?view=gallery"
            className={`inline-flex items-center gap-2 border border-slate-700 px-5 py-2.5 rounded-md ${
              progress === 100 ? "bg-emerald-600 hover:bg-emerald-500 text-slate-900" : "bg-slate-900 text-slate-100 opacity-70 cursor-not-allowed"
            }`}
            aria-disabled={progress !== 100}
            onClick={(e) => {
              if (progress !== 100) e.preventDefault();
            }}
          >
            Go to Gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
