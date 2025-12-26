"use client";

import { useState } from "react";

export default function CreativeRequestPage() {
  const [bannerName, setBannerName] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | { success: true; taskUrl?: string | null; taskId?: string | null }
    | { success: false; error: string }
    | null
  >(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/create-banner-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerName, description, region, brand }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        setResult({ success: false, error: data?.error || text || `Request failed (${res.status})` });
      } else {
        setResult({ success: true, taskUrl: data?.taskUrl ?? null, taskId: data?.taskId ?? null });
      }
    } catch (err: any) {
      setResult({ success: false, error: err?.message || "Unexpected error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-slate-100">
      <h1 className="text-3xl font-semibold mb-4 text-white">Create Creative Request</h1>
      <p className="text-sm text-slate-300 mb-6">
        Fill this form to create a task in ClickUp (Design Assets). The task will be set to
        <span className="font-medium"> design requested</span> to trigger BannerBot.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-slate-200">Banner name</label>
          <input
            type="text"
            className="w-full rounded px-3 py-2 border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="3Star MY – Weekend Promo"
            value={bannerName}
            onChange={(e) => setBannerName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-slate-200">Description</label>
          <textarea
            className="w-full rounded px-3 py-2 border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Brief details and required sizes, formats, copy, etc."
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-200">Region</label>
            <input
              type="text"
              className="w-full rounded px-3 py-2 border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="MY, SG, PH"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-200">Brand</label>
            <input
              type="text"
              className="w-full rounded px-3 py-2 border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="3Star, LuckyDay"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Task"}
        </button>
      </form>

      {result && (
        <div className="mt-6 p-4 border rounded">
          {result.success ? (
            <div className="bg-emerald-900/30 border border-emerald-600 rounded p-4">
              <div className="text-emerald-200 font-medium">Task created successfully.</div>
              {result.taskUrl ? (
                <a className="text-emerald-300 underline" href={result.taskUrl} target="_blank" rel="noreferrer">
                  Open in ClickUp
                </a>
              ) : (
                <div className="text-sm text-slate-300">No task link returned.</div>
              )}
            </div>
          ) : (
            <div className="bg-rose-900/30 border border-rose-600 rounded p-4">
              <div className="text-rose-200 font-medium">Failed to create task.</div>
              <div className="text-sm text-rose-100 break-words">{result.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
