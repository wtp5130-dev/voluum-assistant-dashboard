"use client";
import React, { useEffect, useState } from "react";

export default function MediaLibraryPage() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [brandName, setBrandName] = useState("");
  const [tags, setTags] = useState("");

  const load = async () => {
    setLoading(true); setError(null);
    try { const r = await fetch("/api/media", { cache: "no-store" }); const j = await r.json(); setItems(Array.isArray(j?.items) ? j.items : []);} catch(e:any){ setError(e?.message||String(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (brandName) fd.append("brandName", brandName);
    if (tags) fd.append("tags", tags);
    try { const r = await fetch("/api/media", { method: "POST", body: fd }); if(!r.ok){ const t=await r.text(); throw new Error(t);} await load(); setFile(null);} catch(e:any){ setError(e?.message||String(e)); }
  };

  const remove = async (id: string) => { try{ await fetch("/api/media", { method: "DELETE", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ id }) }); setItems((p)=>p.filter(x=>x.id!==id)); }catch{} };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Media Library</h1>
          <button onClick={load} className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Refresh</button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-4">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">File</label>
            <input type="file" accept="image/*" onChange={(e)=>setFile((e.target.files && e.target.files[0]) || null)} className="block w-full text-[11px]" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Brand name</label>
            <input value={brandName} onChange={(e)=>setBrandName(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Tags (comma)</label>
            <input value={tags} onChange={(e)=>setTags(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button onClick={upload} disabled={!file} className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">Upload</button>
          </div>
        </div>
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        {loading && <div className="text-sm text-slate-400">Loading…</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it)=> (
            <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
              <div className="aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.filename} className="w-full h-full object-contain" />
              </div>
              <div className="p-3 text-[11px] space-y-1">
                <div className="text-slate-300 font-semibold">{it.filename}</div>
                <div className="text-slate-500">{new Date(it.createdAt).toLocaleString()}</div>
                {it.brandName && <div className="text-slate-400">Brand: <span className="text-slate-200">{it.brandName}</span></div>}
                {it.tags && <div className="text-slate-400">Tags: <span className="text-slate-200">{Array.isArray(it.tags)?it.tags.join(', '):''}</span></div>}
                <div className="flex items-center justify-end gap-2">
                  <a href={it.url} download className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Download</a>
                  <button onClick={()=>navigator.clipboard.writeText(it.url)} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Copy URL</button>
                  <button onClick={()=>remove(it.id)} className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
