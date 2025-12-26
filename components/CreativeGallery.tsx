"use client";

import React, { useEffect, useMemo, useState } from "react";

export default function CreativeGallery() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [filterBrand, setFilterBrand] = useState<string>("");
  // style filter removed
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [me, setMe] = useState<{ username?: string; email?: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
  useEffect(() => {
    (async () => {
      try { const r = await fetch("/api/brand", { cache: "no-store" }); const j = await r.json(); setBrands(Array.isArray(j?.brands) ? j.brands : []);} catch {}
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try { const r = await fetch("/api/auth/me", { cache: "no-store" }); const j = await r.json(); setMe(j?.user || null);} catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 24*3600*1000 - 1 : Number.MAX_SAFE_INTEGER;
    return items.filter((it) => {
      const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
      if (t < fromTs || t > toTs) return false;
      // no style filter
      if (filterBrand) {
        const bn = (it.brandName || "").toLowerCase();
        const target = (brands.find(b=>b.id===filterBrand)?.name || "").toLowerCase();
        if (!bn || !target || bn !== target) return false;
      }
      return true;
    });
  }, [items, from, to, filterBrand, brands]);

  const remove = async (id: string) => {
    try {
      await fetch("/api/creative-gallery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id })});
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {}
  };

  const addComment = async (id: string) => {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    try {
      const author = me?.username || me?.email || undefined;
      const r = await fetch("/api/creative-gallery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, comment: { text, author } })});
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      setItems((prev) => prev.map((x) => (x.id === id ? j.item : x)));
      setDrafts((d) => ({ ...d, [id]: "" }));
    } catch (e) {
      console.error(e);
    }
  };

  const setStatus = async (id: string, status: "approved" | "changes_requested" | "resolved") => {
    try {
      const r = await fetch("/api/creative-gallery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status })});
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      setItems((prev) => prev.map((x) => (x.id === id ? j.item : x)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gallery</h2>
        <button onClick={load} className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Refresh</button>
      </div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {loading && <div className="text-sm text-slate-400">Please be patient…</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Brand</label>
          <select value={filterBrand} onChange={(e)=>setFilterBrand(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
            <option value="">All</option>
            {brands.map((b)=> (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </div>
        {/* style preset filter removed */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">From</label>
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">To</label>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1" />
        </div>
        <div className="ml-auto text-slate-500">{filtered.length} result(s)</div>
      </div>
      {(!loading && filtered.length === 0) ? (
        <div className="text-sm text-slate-400">No generated creatives saved yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
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
                {/* Status */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const s = it.status || 'open';
                    const color = s === 'approved' ? 'bg-emerald-700/50 border-emerald-600 text-emerald-200' : s === 'changes_requested' ? 'bg-amber-700/50 border-amber-600 text-amber-200' : s === 'resolved' ? 'bg-slate-700/50 border-slate-600 text-slate-200' : 'bg-blue-700/30 border-blue-600 text-blue-200';
                    const label = s.replace(/_/g, ' ');
                    return <span className={`px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
                  })()}
                  <div className="ml-auto inline-flex items-center gap-2">
                    <button onClick={() => setStatus(it.id, 'approved')} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500">Approve</button>
                  </div>
                </div>
                {Array.isArray(it.outputs) && it.outputs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {it.outputs.map((o: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded-full border border-slate-700 bg-slate-950 text-slate-300">{o}</span>
                    ))}
                  </div>
                )}
                {it.brandName && <div className="text-slate-400">Brand: <span className="text-slate-200">{it.brandName}</span></div>}
                {/* size, style, prompt removed */}
                {it.botComment && (
                  <div className="text-slate-300">
                    <div className="uppercase text-[10px] text-slate-400">BannerBot</div>
                    <div className="whitespace-pre-wrap break-words bg-slate-950/60 border border-slate-800 rounded-md p-2">{it.botComment}</div>
                  </div>
                )}
                {/* Comments thread */}
                {Array.isArray(it.comments) && it.comments.length > 0 && (
                  <div className="space-y-1">
                    {it.comments.map((c: any) => (
                      <div key={c.id} className="text-slate-300 bg-slate-950/40 border border-slate-800 rounded-md p-2">
                        <div className="text-slate-400 text-[10px] mb-1">{c.author || "User"} • {new Date(c.ts).toLocaleString()}</div>
                        <div className="whitespace-pre-wrap break-words">{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add comment */}
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[it.id] || ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    placeholder="Write a comment…"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-slate-100"
                  />
                  <button onClick={() => addComment(it.id)} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500">Comment</button>
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
  );
}
