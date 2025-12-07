"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Me = { username: string; role: "admin" | "user"; perms: Record<string, boolean> } | null;

export default function NavBar() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"live" | "degraded" | "down">("live");
  const [detail, setDetail] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<"dashboard" | "optimizer" | "creatives" | "builder">("dashboard");

  // Sync active tab from page
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const key = (e as CustomEvent).detail as typeof activeTab;
        setActiveTab(key);
      } catch {}
    };
    window.addEventListener("tab:current" as any, handler as any);
    return () => window.removeEventListener("tab:current" as any, handler as any);
  }, []);

  const selectTab = (key: typeof activeTab) => {
    window.dispatchEvent(new CustomEvent("tab:select", { detail: key }));
  };

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

  // Health checks
  const runHealth = async () => {
    if (checking) return;
    setChecking(true);
    const checks = [
      { name: "kv", url: "/api/optimizer/blacklist-log" },
      { name: "dashboard", url: "/api/voluum-dashboard?dateRange=last7days" },
      { name: "creative-doctor", url: "/api/creative-doctor" },
      { name: "creative-assets", url: "/api/creative-assets" },
    ];
    const results: string[] = [];
    let okCount = 0;
    for (const c of checks) {
      try {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(c.url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(id);
        if (res.ok) {
          okCount++;
        } else {
          results.push(`${c.name}:${res.status}`);
        }
      } catch (e: any) {
        results.push(`${c.name}:err`);
      }
    }
    if (okCount === checks.length) {
      setStatus("live");
      setDetail("All systems nominal");
    } else if (okCount > 0) {
      setStatus("degraded");
      setDetail(results.join(", "));
    } else {
      setStatus("down");
      setDetail(results.join(", "));
    }
    setChecking(false);
  };

  useEffect(() => {
    let timer: any;
    runHealth();
    timer = setInterval(runHealth, 60000);
    return () => clearInterval(timer);
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
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 text-slate-100 whitespace-nowrap">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              status === "live" ? "bg-emerald-500" : status === "degraded" ? "bg-amber-400" : "bg-rose-500"
            }`}
            title={detail || (status === "live" ? "Live" : status)}
          />
          <span className="text-sm font-semibold">Voluum Assistant</span>
          <span className="ml-2 text-[11px] text-slate-400 hidden sm:inline" title={detail || undefined}>
            {status === "live" ? "Live" : status === "degraded" ? "Degraded" : "Down"}
          </span>
        </a>
        {/* Main tabs on home page */}
        {pathname === "/" && (
          <div className="hidden md:flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/70 p-1 shadow-sm text-[12px]">
            <button onClick={() => selectTab("dashboard")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "dashboard" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Dashboard</button>
            {(me?.role === "admin" || me?.perms?.optimizer || !me) && (
              <button onClick={() => selectTab("optimizer")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "optimizer" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Optimizer</button>
            )}
            {(me?.role === "admin" || me?.perms?.creatives || !me) && (
              <button onClick={() => selectTab("creatives")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "creatives" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Creatives</button>
            )}
            {(me?.role === "admin" || me?.perms?.builder || !me) && (
              <button onClick={() => selectTab("builder")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "builder" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Campaign Builder</button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={runHealth}
            disabled={checking}
            className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
            title="Refresh status"
          >
            {checking && (
              <span className="inline-block w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            )}
            Refresh
          </button>
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
