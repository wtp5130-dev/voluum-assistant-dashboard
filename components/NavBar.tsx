"use client";

import React, { useEffect, useState } from "react";
import { signOut as nextAuthSignOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

type Me = { username: string; role: "admin" | "user"; perms: Record<string, boolean> } | null;

export default function NavBar() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"live" | "degraded" | "down">("live");
  const [detail, setDetail] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "optimizer" | "creatives" | "builder" | "audit">("dashboard");

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
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      url.hash = `#${key}`;
      window.history.replaceState(null, "", url.toString());
    } catch {}
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
  useEffect(() => {
    // initialize from hash for highlighting
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams.get("tab");
      const h = (url.hash || "").replace(/^#/, "");
      const v = (p || h) as string;
      if (v === "dashboard" || v === "optimizer" || v === "creatives" || v === "builder" || v === "audit") setActiveTab(v as any);
    } catch {}
  }, []);

  // Health checks
  const runHealth = async () => {
    if (checking) return;
    setChecking(true);
    const checks = [
      { name: "kv", url: "/api/optimizer/blacklist-log" },
      { name: "dashboard", url: "/api/voluum-dashboard?dateRange=last7days" },
      { name: "gallery", url: "/api/creative-gallery" },
      { name: "webhook", url: "/api/clickup-webhook" },
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
      // Attempt NextAuth sign out first
      await nextAuthSignOut({ callbackUrl: "/login" });
    } catch {
      // Fallback to legacy logout
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
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
          <span className="text-sm font-semibold">PropellarAds Sidekick</span>
          <span className="ml-2 text-[11px] text-slate-400 hidden sm:inline" title={detail || undefined}>
            {status === "live" ? "Live" : status === "degraded" ? "Degraded" : "Down"}
          </span>
        </a>
        {/* Quick refresh next to status dot */}
        <button
          onClick={runHealth}
          disabled={checking}
          className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
          title="Refresh system status"
          aria-label="Refresh status"
        >
          {checking ? (
            <span className="inline-block w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>Refresh</span>
          )}
        </button>
        {/* Main tabs – visible on all pages. Use buttons on home, links elsewhere */}
        <div className="hidden md:flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/70 p-1 shadow-sm text-[12px]">
          {pathname === "/" ? (
            <>
              <button onClick={() => selectTab("dashboard")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "dashboard" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Dashboard</button>
              {(me?.role === "admin" || me?.perms?.optimizer || !me) && (
                <button onClick={() => selectTab("optimizer")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "optimizer" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Optimizer</button>
              )}
              {(me?.role === "admin" || me?.perms?.creatives || !me) && (
                <>
                  <button onClick={() => selectTab("creatives")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "creatives" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Creatives</button>
                  <button onClick={() => router.push("/creative-request")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Generator</button>
                </>
              )}
              {(me?.role === "admin" || me?.perms?.builder || !me) && (
                <button onClick={() => selectTab("builder")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "builder" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Campaign Builder</button>
              )}
              {me?.role === "admin" && (
                <button onClick={() => selectTab("audit")} className={`px-4 py-1.5 rounded-full hover:bg-slate-800 ${activeTab === "audit" ? "bg-emerald-500 text-slate-900" : "text-slate-200"}`}>Audit Trail</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => router.push("/?tab=dashboard#dashboard")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Dashboard</button>
              {(me?.role === "admin" || me?.perms?.optimizer || !me) && (
                <button onClick={() => router.push("/?tab=optimizer#optimizer")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Optimizer</button>
              )}
              {(me?.role === "admin" || me?.perms?.creatives || !me) && (
                <>
                  <button onClick={() => router.push("/?tab=creatives#creatives")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Creatives</button>
                  <button onClick={() => router.push("/creative-request")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Generator</button>
                </>
              )}
              {(me?.role === "admin" || me?.perms?.builder || !me) && (
                <button onClick={() => router.push("/?tab=builder#builder")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Campaign Builder</button>
              )}
              {me?.role === "admin" && (
                <button onClick={() => router.push("/?tab=audit#audit")} className="px-4 py-1.5 rounded-full hover:bg-slate-800 text-slate-200">Audit Trail</button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => router.push("/reports")}
            className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 hidden sm:inline"
          >
            Reports
          </button>
          {/* Media and Gallery removed from top nav; accessible inside Creatives */}
          {me?.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Admin
            </button>
          )}
          {/* Legacy auth controls only */}
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
