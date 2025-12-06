"use client";

import React, { useEffect, useState } from "react";

type Me = { username: string; role: "admin" | "user"; perms: Record<string, boolean> } | null;

export default function NavBar() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        setMe(json?.user ?? null);
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-slate-950/70 bg-slate-950/90 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-slate-100">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold">Voluum Assistant</span>
        </a>
        <div className="flex items-center gap-2">
          {me?.role === "admin" && (
            <a
              href="/admin"
              className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Admin
            </a>
          )}
          {!loading && me ? (
            <button
              onClick={signOut}
              className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Sign out
            </button>
          ) : (
            <a
              href="/login"
              className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
