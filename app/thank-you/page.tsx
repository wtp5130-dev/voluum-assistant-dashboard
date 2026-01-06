"use client";

import Link from "next/link";
import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

function ThankYouInner() {
  const [progress, setProgress] = React.useState(0);
  const [importMsg, setImportMsg] = React.useState<string>("");
  const [done, setDone] = React.useState<boolean>(false);
  const [statusLabel, setStatusLabel] = React.useState<string>("Queued");
  const search = useSearchParams();
  const router = useRouter();
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
    // Simulate progress up to 90% max. Reaching 100% only happens when import succeeds.
    let pct = 0;
    const tick = () => {
      if (done) return; // stop when finished
      const max = 90; // cap until real import completes
      const step = Math.max(1, Math.round(Math.random() * (pct < 60 ? 7 : 4)));
      pct = Math.min(max, pct + step);
      setProgress(pct);
      if (pct < max && !done) timer = setTimeout(tick, 400 + Math.random() * 500);
    };
    let timer: any = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [done]);

  // If a task id is present, poll the import endpoint to pull images into Gallery
  React.useEffect(() => {
    const taskId = search?.get("task") || search?.get("taskId") || "";
    if (!taskId) return;
    let tries = 0;
    let stop = false;
    const poll = async () => {
      if (stop) return;
      tries++;
      try {
        // Poll ClickUp task to mirror agent step progress
        try {
          const pRes = await fetch(`/api/clickup-task/progress?task=${encodeURIComponent(taskId)}`, { cache: "no-store" });
          const pj = await pRes.json().catch(() => ({}));
          if (pj?.ok) {
            setStatusLabel(pj.label || "Processing");
            setProgress((prev) => Math.max(prev, Math.min(90, Number(pj.percent || 0))));
          }
        } catch {}

        const res = await fetch(`/api/creative-gallery/import?task=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (j?.saved > 0) {
          setImportMsg(`Imported ${j.saved} image(s) for task ${taskId}.`);
          setProgress(100);
          setDone(true);
          return; // stop polling
        }
        setImportMsg(j?.error ? `Import error: ${j.error}` : `Waiting for images… attempt ${tries}`);
      } catch (e: any) {
        setImportMsg(`Import error: ${e?.message || String(e)}`);
      }
      if (tries < 24 && !stop) {
        setTimeout(poll, 5000);
      } else if (!stop) {
        setImportMsg((m) => m || "Still processing… you can check the Gallery in a moment.");
      }
    };
    poll();
    return () => { stop = true; };
  }, [search]);

  const current = { pct: progress, label: statusLabel } as any;

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
        {!!importMsg && <div className="text-[12px] text-slate-400 mb-2">{importMsg}</div>}

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

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">⏳</div>
            <h1 className="text-2xl font-semibold mb-2">Request received</h1>
            <p className="text-slate-300">Loading progress…</p>
          </div>
        </main>
      }
    >
      <ThankYouInner />
    </Suspense>
  );
}
