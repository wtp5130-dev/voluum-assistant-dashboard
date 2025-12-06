"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Login failed (${res.status})`);
      }
      const cb = params.get("callbackUrl") || "/";
      router.replace(cb);
    } catch (err: any) {
      setError(err?.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <div className="grid gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-400">Username</label>
          <input
            className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-400">Password</label>
          <input
            type="password"
            className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full text-sm px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
