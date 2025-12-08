"use client";
import React, { useEffect, useMemo, useState } from "react";

export default function CreativeGalleryPage() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterStyle, setFilterStyle] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

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

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 24*3600*1000 - 1 : Number.MAX_SAFE_INTEGER;
    return items.filter((it) => {
      const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
      if (t < fromTs || t > toTs) return false;
      if (filterStyle && String(it.style_preset||"").toLowerCase() !== filterStyle.toLowerCase()) return false;
      if (filterBrand) {
        const bn = (it.brandName || "").toLowerCase();
        const target = (brands.find(b=>b.id===filterBrand)?.name || "").toLowerCase();
        if (!bn || !target || bn !== target) return false;
      }
      return true;
    });
  }, [items, from, to, filterStyle, filterBrand, brands]);

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
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Brand</label>
            <select value={filterBrand} onChange={(e)=>setFilterBrand(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
              <option value="">All</option>
              {brands.map((b)=> (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Style preset</label>
            <select value={filterStyle} onChange={(e)=>setFilterStyle(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
              <option value="">All</option>
              <option value="MIXED_MEDIA">MIXED_MEDIA</option>
              <option value="90S_NOSTALGIA">90S_NOSTALGIA</option>
              <option value="SPOTLIGHT_80S">SPOTLIGHT_80S</option>
              <option value="C4D_CARTOON">C4D_CARTOON</option>
              <option value="JAPANDI_FUSION">JAPANDI_FUSION</option>
              <option value="CYBERPUNK">CYBERPUNK</option>
              <option value="NEON_NOIR">NEON_NOIR</option>
              <option value="RETRO_FUTURISM">RETRO_FUTURISM</option>
              <option value="VAPORWAVE">VAPORWAVE</option>
              <option value="POP_ART">POP_ART</option>
              <option value="COMIC_BOOK">COMIC_BOOK</option>
              <option value="ANIME">ANIME</option>
              <option value="PIXEL_ART">PIXEL_ART</option>
              <option value="LOWPOLY">LOWPOLY</option>
              <option value="WATERCOLOR">WATERCOLOR</option>
              <option value="OIL_PAINTING">OIL_PAINTING</option>
              <option value="ART_BRUT">ART_BRUT</option>
              <option value="LINE_ART">LINE_ART</option>
              <option value="ISOMETRIC">ISOMETRIC</option>
              <option value="3D_RENDER">3D_RENDER</option>
              <option value="ULTRA_REALISTIC">ULTRA_REALISTIC</option>
              <option value="CINEMATIC">CINEMATIC</option>
              <option value="FILM_GRAIN">FILM_GRAIN</option>
              <option value="BLACK_WHITE">BLACK_WHITE</option>
              <option value="DUOTONE">DUOTONE</option>
              <option value="LONG_EXPOSURE">LONG_EXPOSURE</option>
              <option value="BOKEH">BOKEH</option>
              <option value="TYPOGRAPHY_BOLD">TYPOGRAPHY_BOLD</option>
            </select>
          </div>
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
