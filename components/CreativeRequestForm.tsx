"use client";

import { useState, useRef, DragEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

export default function CreativeRequestForm() {
  const router = useRouter();
  const search = useSearchParams();
  const listIdParam = search?.get("listId") || search?.get("list_id") || "";

  const [title, setTitle] = useState("Mid Autumn Festival");
  const [description, setDescription] = useState("");
  const COUNTRIES = ["Malaysia", "Indonesia", "Thailand", "Singapore", "Mexico"];
  const BRANDS = ["3Star88", "Sol88"];
  const [country, setCountry] = useState("");
  const [brand, setBrand] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [requesterInfo, setRequesterInfo] = useState("");
  type Picked = { file: File; url: string };
  const [files, setFiles] = useState<Picked[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      // Validate required fields
      if (!title || !country || !brand) {
        setResult({ success: false, error: "Please fill in required fields (Title, Country, Brand)." });
        setLoading(false);
        return;
      }
      // Reference files are optional

      const fd = new FormData();
      fd.append("title", title);
      fd.append("description", description);
      fd.append("country", country);
      fd.append("brand", brand);
      fd.append("status", "design requested");
      sizes.forEach((s) => fd.append("sizes", s));
      if (customSize) fd.append("customSize", customSize);
      if (requesterInfo) fd.append("requesterInfo", requesterInfo);
      if (listIdParam) fd.append("listId", listIdParam);
      files.forEach(({ file }) => fd.append("reference", file));

      const res = await fetch("/api/create-banner-task", { method: "POST", body: fd });
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
        // Redirect to thank-you after a short delay
        setTimeout(() => router.push("/thank-you"), 600);
      }
    } catch (err: any) {
      setResult({ success: false, error: err?.message || "Unexpected error" });
    } finally {
      setLoading(false);
    }
  }

  // file helpers
  const onPickFiles = (fs: FileList | null) => {
    if (!fs) return;
    const next: Picked[] = Array.from(fs).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles((prev) => [...prev, ...next]);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onPickFiles(e.dataTransfer.files);
  };
  const toggleSize = (val: string) => {
    setSizes((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      try { if (removed?.url) URL.revokeObjectURL(removed.url); } catch {}
      return copy;
    });
  };

  useEffect(() => {
    return () => {
      // cleanup all blob urls on unmount
      try { files.forEach((p) => p?.url && URL.revokeObjectURL(p.url)); } catch {}
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-white">
          🎯 Creative Banner Request Form
        </h1>
        <p className="text-slate-300">
          Submit a new banner or marketing visual request below. BannerBot will automatically generate the first concept and mark it as “In Progress” for review.
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-16">
        <form onSubmit={handleSubmit} className="space-y-6 bg-slate-900/70 rounded-xl shadow-xl border border-slate-800 p-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-200">Banner Title</label>
            <input
              type="text"
              className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mid Autumn Festival"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-200">Description</label>
            <textarea
              className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any copy, ideas, or specs."
            />
          </div>

          {/* Country + Brand */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-200">Country<span className="text-rose-400">*</span></label>
              <select
                className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
              >
                <option value="">Select a country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-200">Brand<span className="text-rose-400">*</span></label>
              <select
                className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
              >
                <option value="">Select a brand…</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference upload */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-200">Reference <span className="text-slate-400 font-normal">(optional)</span></label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed rounded-lg p-6 text-center text-slate-300 bg-slate-900 border-slate-700"
            >
              <p className="mb-2">Drop your files here to upload</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-slate-800 text-white px-3 py-1.5 rounded"
              >
                Choose Files
              </button>
              {files.length > 0 && (
                <div className="mt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {files.map((p, i) => (
                      <div key={i} className="relative group border border-slate-700 rounded-md overflow-hidden bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={p.file.name} className="w-full h-28 object-cover" />
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-1.5 right-1.5 rounded-full bg-black/60 text-white text-xs px-2 py-0.5 opacity-0 group-hover:opacity-100 transition"
                          aria-label={`Remove ${p.file.name}`}
                        >
                          Remove
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] px-1 py-0.5 truncate" title={p.file.name}>{p.file.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sizes */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-200">Outputs</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { key: "Push Notifications (720x480)", label: "Push Notifications (720x480)" },
                { key: "Telegram (900x900)", label: "Telegram (900×900)" },
                { key: "Website Banner (1920x1080)", label: "Website Banner (1920×1080)" },
                { key: "Facebook / Instagram Post (1080x1080)", label: "Facebook / Instagram Post (1080×1080)" },
                { key: "Story / Reel (1080x1920)", label: "Story / Reel (1080×1920)" },
                { key: "Display Ad (300x250)", label: "Display Ad (300×250)" },
              ].map((opt) => (
                <label key={opt.key} className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="rounded border-slate-700 bg-slate-900"
                    checked={sizes.includes(opt.key)}
                    onChange={() => toggleSize(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium mb-1 text-slate-200">Custom Size</label>
              <input
                type="text"
                className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                placeholder="e.g., 1200×628 or 600×600"
              />
            </div>
          </div>

          {/* Requester */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-200">Requester Info (Optional)</label>
            <input
              type="text"
              className="w-full rounded px-3 py-2 border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={requesterInfo}
              onChange={(e) => setRequesterInfo(e.target.value)}
              placeholder="Your name or email"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Submitting…" : "Submit Request"}
          </button>

          {result && (
            <div className="mt-4">
              {result.success ? (
                <div className="text-emerald-300">Task created successfully.</div>
              ) : (
                <div className="text-rose-300">{result.error}</div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
