"use client";
import React, { useEffect, useState } from "react";

export default function CreativeGalleryPage() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/creative-gallery", { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    try {
      await fetch("/api/creative-gallery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id })});
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {}
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Creative Gallery</h1>
          <button onClick={load} className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Refresh</button>
        </div>
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        {loading && <div className="text-sm text-slate-400">Loading…</div>}
        {(!loading && items.length === 0) ? (
          <div className="text-sm text-slate-400">No generated creatives saved yet.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden flex flex-col">
                <div className="aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="creative" className="w-full h-full object-contain" />
                </div>
                <div className="p-3 text-[11px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">{(it.provider || "").toUpperCase()}</span>
                    <span className="text-slate-500">{new Date(it.createdAt).toLocaleString()}</span>
                  </div>
                  {it.brandName && <div className="text-slate-400">Brand: <span className="text-slate-200">{it.brandName}</span></div>}
                  <div className="text-slate-400">Size: <span className="text-slate-200">{it.size || "—"}</span></div>
                  <div className="text-slate-400">Style: <span className="text-slate-200">{it.style_preset || "—"}</span></div>
                  {it.negative_prompt && <div className="text-slate-400">Avoid: <span className="text-slate-200">{it.negative_prompt}</span></div>}
                  <div className="text-slate-300">
                    <div className="uppercase text-[10px] text-slate-400">Prompt</div>
                    <pre className="whitespace-pre-wrap break-words bg-slate-950/60 border border-slate-800 rounded-md p-2 max-h-40 overflow-auto">{it.prompt}</pre>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <a href={it.url} download className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Download</a>
                    <button onClick={() => navigator.clipboard.writeText(it.prompt || "")} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Copy prompt</button>
                    <button onClick={() => remove(it.id)} className="text-[11px] px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
