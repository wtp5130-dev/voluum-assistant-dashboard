"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef, useId } from "react";
import CreativeGallery from "@/components/CreativeGallery";

/**
 * ===========
 * Types
 * ===========
 */

type KPI = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
};

type Zone = {
  id: string;
  visits: number;
  conversions: number;
  signups: number;
  deposits: number;
  revenue: number;
  cost: number;
  roi: number;
};

type Creative = {
  id: string;
  name?: string | null;
  visits: number;
  conversions: number;
  signups: number;
  deposits: number;
  revenue: number;
  cost: number;
  roi: number;
};

type Campaign = {
  id: string;
  name: string;
  trafficSource: string;
  visits: number;
  conversions: number;
  signups: number;
  deposits: number;
  revenue: number;
  profit: number;
  roi: number;
  cost: number;
  cpa: number;
  cpr: number;
  zones?: Zone[];
  creatives?: Creative[];
};

type SeriesPoint = {
  date: string;
  cost: number;
  revenue: number;
  profit: number;
  signups: number;
  deposits: number;
  cpa: number | null;
  cpr: number | null;
};

type DashboardData = {
  dateRange: string;
  from: string;
  to: string;
  kpis: KPI[];
  campaigns: Campaign[];
  series?: SeriesPoint[];
};

type DateRangeKey =
  | "today"
  | "yesterday"
  | "last3days"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "custom";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TabKey = "dashboard" | "optimizer" | "creatives" | "builder" | "audit" | "updates";
type ViewMode = "standard" | "charts";

/**
 * ===========
 * Config
 * ===========
 */

const DASHBOARD_API_URL = "/api/voluum-dashboard";
const CHAT_API_URL = "/api/chat";
const OPTIMIZER_PREVIEW_URL = "/api/optimizer/preview";
const OPTIMIZER_APPLY_URL = "/api/optimizer/apply";
const IMAGE_PROVIDER_DEFAULT = (process.env.NEXT_PUBLIC_IMAGE_PROVIDER as string) || "ideogram";

// Date range UI options
const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last3days", label: "Last 3 days" },
  { key: "last7days", label: "Last 7 days" },
  { key: "last30days", label: "Last 30 days" },
  { key: "thismonth", label: "This month" },
  { key: "custom", label: "Custom…" },
];

// Minimal ad types (labels used in Builder select)
const AD_TYPES: Record<string, { label: string }> = {
  "push-classic": { label: "Propeller Push" },
  "inpage-push": { label: "In-Page Push" },
  interstitial: { label: "Interstitial" },
  onclick: { label: "Onclick / Direct Click" },
};

/**
 * ===========
 * Helpers
 * ===========
 */

function formatMoney(value: number | string): string {
  if (typeof value === "string") return value;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    return `${sign}$${abs.toFixed(2)}`;
  }
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatInteger(value: number): string {
  try {
    return Number(value).toLocaleString("en-US");
  } catch {
    return String(value);
  }
}

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayYMD(): string {
  return formatDateYMD(new Date());
}

function getDaysAgoYMD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDateYMD(d);
}

// Timezone-aware date formatting (GMT+8)
const TZ_GMT8 = "Asia/Singapore";
const TZ_LABEL = "GMT+8";
function formatDateTimeGMT8(value: string | Date): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_GMT8,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(dt);
  return `${formatted} ${TZ_LABEL}`;
}

/**
 * ===========
 * Main page
 * ===========
 */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<DateRangeKey>("last7days");
  const [fromDate, setFromDate] = useState<string>(() => getDaysAgoYMD(7));
  const [toDate, setToDate] = useState<string>(() => getTodayYMD());

  const [trafficSourceFilter, setTrafficSourceFilter] =
    useState<string>("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );

  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [currentUser, setCurrentUser] = useState<null | { username: string; role: "admin" | "user"; perms: { dashboard: boolean; optimizer: boolean; creatives: boolean; builder: boolean } }>(null);

  // Dashboard chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey! I can help you analyze campaigns, zones, and creatives. What do you want to look at?",
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Optimizer state
  const [optimizerPreviewLoading, setOptimizerPreviewLoading] =
    useState(false);
  const [optimizerApplyLoading, setOptimizerApplyLoading] = useState(false);
  const [optimizerDryRun, setOptimizerDryRun] = useState(true);
  const [optimizerPreviewResult, setOptimizerPreviewResult] = useState<
    | {
        rules: any[];
        zonesToPauseNow: any[];
        meta?: any;
      }
    | null
  >(null);
  const [optimizerStatus, setOptimizerStatus] = useState<string | null>(
    null
  );

  // Optimizer blacklist history (server via KV, with graceful fallback)
  type BlacklistedZone = { id?: string; zoneId: string; campaignId: string; timestamp: string; reverted?: boolean; revertedAt?: string | null; verified?: boolean; verifiedAt?: string | null };
  const [blacklistedZones, setBlacklistedZones] = useState<BlacklistedZone[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any | null>(null);
  const refreshBlacklist = useCallback(async () => {
    try {
      const res = await fetch("/api/optimizer/blacklist-log", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      setBlacklistedZones(items.map((i: any) => ({
        id: i.id ? String(i.id) : undefined,
        zoneId: String(i.zoneId),
        campaignId: String(i.campaignId),
        timestamp: String(i.timestamp),
        reverted: Boolean(i.reverted),
        revertedAt: i.revertedAt ? String(i.revertedAt) : null,
        verified: Boolean(i.verified),
        verifiedAt: i.verifiedAt ? String(i.verifiedAt) : null,
      })));
    } catch {
      // fallback to localStorage
      try {
        const raw = localStorage.getItem("blacklistedZones");
        if (raw) setBlacklistedZones(JSON.parse(raw));
      } catch {}
    }
  }, []);

  // (moved) Brands are loaded inside CreativesTab
  const handleSync = useCallback(async () => {
    setSyncLoading(true);
    setLastSyncResult(null);
    try {
      const res = await fetch("/api/optimizer/sync-blacklist", { method: "POST" });
      const json = await res.json().catch(() => null);
      setLastSyncResult(json);
      await refreshBlacklist();
    } catch (e: any) {
      setLastSyncResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSyncLoading(false);
    }
  }, [refreshBlacklist]);
  useEffect(() => {
    refreshBlacklist();
  }, [refreshBlacklist]);

  // Creatives doctor chat
  const [creativeChatMessages, setCreativeChatMessages] = useState<
    ChatMessage[]
  >([
    {
      role: "assistant",
      content:
        "I’m your Creative Doctor. Paste a headline, angle, or campaign context and I’ll help you improve it.",
    },
  ]);
  const [creativeChatInput, setCreativeChatInput] = useState("");
  const [creativeChatLoading, setCreativeChatLoading] = useState(false);
  const [creativeTokenCount, setCreativeTokenCount] = useState<number>(0);
  const [brandUrl, setBrandUrl] = useState<string>("");
  // Brand-aligned Ideogram prompt suggestions (top-level, shared with CreativesTab)
  const [ideogramSuggestions, setIdeogramSuggestions] = useState<any[]>([]);
  // Creative Doctor: skip cached brand style when sending chat
  const [brandNoCacheChat, setBrandNoCacheChat] = useState<boolean>(false);

  // Fetch current user for permissions
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        if (json?.user) setCurrentUser(json.user);
      } catch {}
    })();
  }, []);

  const can = (key: keyof NonNullable<typeof currentUser>["perms"]) => {
    if (!currentUser) return true; // allow during initial load
    if (currentUser.role === "admin") return true;
    return !!currentUser.perms?.[key];
  };

  const toHash = (t: TabKey) => `#${t}`;
  const fromHash = (h: string): TabKey | null => {
    const v = (h || "").replace(/^#/, "");
    if (v === "dashboard" || v === "optimizer" || v === "creatives" || v === "builder" || v === "updates" || v === "audit") return v as TabKey;
    return null;
  };

  const fromSearch = (s: string): TabKey | null => {
    try {
      const usp = new URLSearchParams(s.startsWith("?") ? s : `?${s}`);
      const t = usp.get("tab");
      if (t === "dashboard" || t === "optimizer" || t === "creatives" || t === "builder" || t === "updates" || t === "audit") return t as TabKey;
      return null;
    } catch {
      return null;
    }
  };

  const updateUrlTab = (t: TabKey) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      url.hash = toHash(t);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };

  // Sync tab selection with sticky navbar
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const key = (e as CustomEvent).detail as TabKey;
        if (key === "dashboard" ||
            (key === "optimizer" && can("optimizer")) ||
            (key === "creatives" && can("creatives")) ||
            (key === "builder" && can("builder")) ||
            key === "audit" ||
            (key === "updates" && currentUser?.role === "admin")) {
          setActiveTab(key);
        }
      } catch {}
    };
    window.addEventListener("tab:select" as any, handler as any);
    // Initialize from URL param/hash
    try {
      const initialParam = fromSearch(window.location.search);
      const initialHash = fromHash(window.location.hash);
      const initial = initialParam || initialHash;
      if (initial && (
        initial === "dashboard" ||
        (initial === "optimizer" && can("optimizer")) ||
        (initial === "creatives" && can("creatives")) ||
        (initial === "builder" && can("builder")) ||
        (initial === "updates" && currentUser?.role === "admin") ||
        (initial === "audit" && currentUser?.role === "admin")
      )) {
        setActiveTab(initial);
      }
    } catch {}
    const onHashChange = () => {
      const next = fromHash(window.location.hash);
      if (!next) return;
      if (
        next === "dashboard" ||
        (next === "optimizer" && can("optimizer")) ||
        (next === "creatives" && can("creatives")) ||
        (next === "builder" && can("builder")) ||
        (next === "updates" && currentUser?.role === "admin") ||
        (next === "audit" && currentUser?.role === "admin")
      ) {
        setActiveTab(next);
      }
    };
    const onPopState = () => {
      const next = fromSearch(window.location.search) || fromHash(window.location.hash);
      if (!next) return;
      if (
        next === "dashboard" ||
        (next === "optimizer" && can("optimizer")) ||
        (next === "creatives" && can("creatives")) ||
        (next === "builder" && can("builder")) ||
        (next === "updates" && currentUser?.role === "admin") ||
        (next === "audit" && currentUser?.role === "admin")
      ) {
        setActiveTab(next);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("tab:select" as any, handler as any);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
    };
  }, [currentUser]);

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("tab:current", { detail: activeTab }));
      updateUrlTab(activeTab);
    } catch {}
  }, [activeTab]);

  // Initialize and persist view mode (standard/charts) in URL and localStorage
  useEffect(() => {
    // on mount: read from URL or localStorage
    try {
      const url = new URL(window.location.href);
      const v = url.searchParams.get("view");
      const ls = localStorage.getItem("dashboard:viewMode");
      const next = (v === "charts" || v === "standard") ? (v as ViewMode) : ((ls === "charts" || ls === "standard") ? (ls as ViewMode) : null);
      if (next && next !== viewMode) setViewMode(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      // persist to URL
      const url = new URL(window.location.href);
      url.searchParams.set("view", viewMode);
      window.history.replaceState(null, "", url.toString());
      // persist to localStorage
      localStorage.setItem("dashboard:viewMode", viewMode);
      // broadcast to any listeners
      window.dispatchEvent(new CustomEvent("view:current", { detail: viewMode }));
    } catch {}
  }, [viewMode]);

  // If user switches to charts view while on other tabs, auto-focus Dashboard tab
  useEffect(() => {
    if (viewMode === "charts" && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [viewMode, activeTab]);

// Creative image generator
const [imagePrompt, setImagePrompt] = useState(
  "High-converting casino push banner, bold CTA, mobile-first, 1:1 format."
);
const [adType, setAdType] = useState<string>("push-classic");
const [assetTitle, setAssetTitle] = useState("");
const [assetDescription, setAssetDescription] = useState("");
const [mainImagePrompt, setMainImagePrompt] = useState("");
const [mainImageSize, setMainImageSize] = useState("1024x1024");
const [imageLoading, setImageLoading] = useState(false);
const [imageError, setImageError] = useState<string | null>(null);
const [imageUrl, setImageUrl] = useState<string | null>(null);
const [imageProvider, setImageProvider] = useState<string>(IMAGE_PROVIDER_DEFAULT);
const [assetsLoading, setAssetsLoading] = useState(false);
const [assetsError, setAssetsError] = useState<string | null>(null);
// Ideogram advanced controls
const [stylePreset, setStylePreset] = useState<string>("");
const [negativePrompt, setNegativePrompt] = useState<string>("");
const [seed, setSeed] = useState<string>("");
const [charRefFiles, setCharRefFiles] = useState<File[]>([]);
const [imageRefFile, setImageRefFile] = useState<File | null>(null);
const [saveToGallery, setSaveToGallery] = useState<boolean>(true);
// Reference influence for character/image refs
const [charRefInfluence, setCharRefInfluence] = useState<number>(70);
const [remixInfluence, setRemixInfluence] = useState<number>(70);

  /**
   * Fetch dashboard data whenever dateRange or custom dates change
   * (client-side only, no full page reload)
   */
  useEffect(() => {
    if (dateRange === "custom" && (!fromDate || !toDate)) {
      return;
    }

    const fetchData = async () => {
      try {
        const isInitial = data === null;
        if (isInitial) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        setError(null);

        const params = new URLSearchParams();

        if (dateRange === "custom") {
          let from = fromDate;
          let to = toDate;
          if (new Date(from) > new Date(to)) {
            [from, to] = [to, from];
          }
          params.set("dateRange", "custom");
          params.set("from", from);
          params.set("to", to);
        } else {
          params.set("dateRange", dateRange);
        }

        const url = `${DASHBOARD_API_URL}?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Failed to fetch (${res.status})${txt ? `: ${txt.slice(0, 300)}` : ""}`);
        }

        const json = (await res.json()) as DashboardData;
        setData(json);

        if (json.campaigns && json.campaigns.length > 0) {
          setSelectedCampaignId((prev) => {
            const stillExists = json.campaigns.some((c) => c.id === prev);
            if (stillExists) return prev;
            return json.campaigns[0].id;
          });
        } else {
          setSelectedCampaignId(null);
        }
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Unknown error fetching data"
        );
      } finally {
        const isInitial = data === null;
        if (isInitial) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    };

    fetchData();
  }, [dateRange, fromDate, toDate]);

  /**
   * Traffic source options
   */
  const trafficSources: string[] = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.campaigns.forEach((c) => set.add(c.trafficSource));
    return Array.from(set);
  }, [data]);

  /**
   * Filter campaigns by traffic source
   */
  const filteredCampaigns: Campaign[] = useMemo(() => {
    if (!data) return [];
    if (trafficSourceFilter === "all") return data.campaigns;
    return data.campaigns.filter(
      (c) => c.trafficSource === trafficSourceFilter
    );
  }, [data, trafficSourceFilter]);

  /**
   * Ensure selected campaign exists in filtered list
   */
  useEffect(() => {
    if (!filteredCampaigns.length) {
      setSelectedCampaignId(null);
      return;
    }

    const stillExists = filteredCampaigns.some(
      (c) => c.id === selectedCampaignId
    );
    if (!stillExists) {
      setSelectedCampaignId(filteredCampaigns[0].id);
    }
  }, [filteredCampaigns, selectedCampaignId]);

  const selectedCampaign: Campaign | null = useMemo(() => {
    if (!filteredCampaigns.length || !selectedCampaignId) return null;
    return (
      filteredCampaigns.find((c) => c.id === selectedCampaignId) ??
      filteredCampaigns[0] ??
      null
    );
  }, [filteredCampaigns, selectedCampaignId]);

  /**
   * Zones / Creatives for selected campaign
   */

  const zones = useMemo<Zone[]>(() => {
    if (!selectedCampaign) return [];

    const raw = selectedCampaign.zones ?? [];

    return raw.filter((z) => {
      const hasMetrics =
        (z.visits ?? 0) > 0 ||
        (z.conversions ?? 0) > 0 ||
        (z.signups ?? 0) > 0 || // 👈 include
        (z.deposits ?? 0) > 0 || // 👈 include
        (z.cost ?? 0) > 0 ||
        (z.revenue ?? 0) > 0;
      const hasId = (z.id ?? "").trim().length > 0;
      return hasMetrics || hasId;
    });
  }, [selectedCampaign]);

  const creatives = useMemo<Creative[]>(() => {
    if (!selectedCampaign) return [];

    const raw = selectedCampaign.creatives ?? [];

    return raw.filter((c) => {
      const hasMetrics =
        (c.visits ?? 0) > 0 ||
        (c.conversions ?? 0) > 0 ||
        (c.signups ?? 0) > 0 || // 👈 include
        (c.deposits ?? 0) > 0 || // 👈 include
        (c.cost ?? 0) > 0 ||
        (c.revenue ?? 0) > 0;
      const hasIdOrName =
        (c.id ?? "").trim().length > 0 ||
        (c.name ?? "").toString().trim().length > 0;

      return hasMetrics || hasIdOrName;
    });
  }, [selectedCampaign]);

  /**
   * Dashboard chat send
   */
  const sendChat = async () => {
    const content = chatInput.trim();
    if (!content || chatLoading) return;

    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content },
    ];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const context = {
        dateRange,
        from: data?.from,
        to: data?.to,
        campaigns: filteredCampaigns,
        selectedCampaignId,
      };

      const res = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, context }),
      });

      if (!res.ok) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const json = (await res.json()) as { reply?: string; message?: string };
      const reply =
        json.reply ??
        json.message ??
        "[No reply field in response from chat API]";

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn’t reach the chat API. Check `/api/chat` on your backend.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  /**
   * Optimizer – preview & apply
   */

  const runOptimizerPreview = async () => {
    if (!data) return;
    try {
      setOptimizerPreviewLoading(true);
      setOptimizerStatus(null);

      const res = await fetch(OPTIMIZER_PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: data,
          trafficSourceFilter,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 403) {
          setOptimizerStatus("No access to Optimizer. Ask an admin to enable the Optimizer permission for your account.");
          return;
        }
        throw new Error(`Preview failed (${res.status}): ${text}`);
      }

      const json = await res.json();
      setOptimizerPreviewResult({
        rules: json.rules ?? [],
        zonesToPauseNow: json.zonesToPauseNow ?? [],
        meta: json.meta ?? null,
      });
      // Provide clearer feedback when preview returned no zones
      const zonesFound = (json.zonesToPauseNow ?? []).length;
      if (zonesFound === 0) {
        setOptimizerStatus("Preview generated: 0 zones flagged. Adjust filters or check campaign zone metrics.");
      } else {
        setOptimizerStatus("Preview generated. Review zones before applying.");
      }
    } catch (err: any) {
      console.error("Optimizer preview error:", err);
      setOptimizerStatus(
        err?.message || "Failed to generate optimizer preview."
      );
    } finally {
      setOptimizerPreviewLoading(false);
    }
  };

  const runOptimizerApply = async (selectedZones: any[]) => {
    if (!optimizerPreviewResult) {
      setOptimizerStatus("Run preview first before applying.");
      return;
    }

    if (!Array.isArray(selectedZones) || selectedZones.length === 0) {
      setOptimizerStatus("No zones selected. Choose at least one to pause.");
      return;
    }

    try {
      setOptimizerApplyLoading(true);
      setOptimizerStatus(null);

      const res = await fetch(OPTIMIZER_APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zonesToPauseNow: selectedZones,
          dryRun: optimizerDryRun,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apply failed (${res.status}): ${text}`);
      }

      const json = await res.json();
      const results = Array.isArray(json?.results) ? json.results : [];
      const okCount = results.filter((r: any) => r.status === "success").length;
      const failCount = results.filter((r: any) => r.status === "failed").length;
      const skipped = results.filter((r: any) => r.status === "skipped").length;
      const firstFailMsg = results.find((r: any) => r.status === "failed")?.message;
      setOptimizerStatus(
        optimizerDryRun
          ? `Dry run completed: ${okCount} would pause, ${skipped} skipped.`
          : `Apply completed: ${okCount} succeeded, ${failCount} failed${skipped ? ", "+skipped+" skipped" : ""}.${firstFailMsg ? " First error: " + firstFailMsg : ""}`
      );

      // After non-dry-run apply, refresh server-side blacklist
      if (!optimizerDryRun) {
        refreshBlacklist();
      }
    } catch (err: any) {
      console.error("Optimizer apply error:", err);
      setOptimizerStatus(err?.message || "Failed to apply optimizer rules.");
    } finally {
      setOptimizerApplyLoading(false);
    }
  };

  /**
   * ===========
   * Render
   * ===========
   */

  if (loading && !data) {
    return (
      <main className="min-h-screen text-slate-100 flex items-center justify-center">
        <div className="text-lg font-medium">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen text-slate-100 flex items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Error</h1>
          <p className="text-sm opacity-80 mb-4">{error}</p>
          <p className="text-xs opacity-60">
            Check your API route (`{DASHBOARD_API_URL}`) and make sure it
            accepts either <code>dateRange</code> or <code>from/to</code>{" "}
            query params.
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen text-slate-100 flex items-center justify-center">
        <div>No data</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-slate-100 pt-0 px-4 md:px-6 pb-6">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-sm md:text-base text-slate-300 mt-1">
            For Marketers. By Marketers
          </p>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {data.dateRange} • {formatDateTimeGMT8(data.from)} – {formatDateTimeGMT8(data.to)}
          </p>
        </div>

        {/* Date + traffic source controls */}
        <div className="flex flex-col gap-3 items-stretch md:items-end">
          <div className="flex flex-wrap gap-3 items-center justify-end">
            {/* Date range selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) =>
                  setDateRange(e.target.value as DateRangeKey)
                }
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs min-w-[140px]"
              >
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick preset pills */}
            <div className="hidden md:flex flex-wrap items-center gap-1">
              {(["today", "yesterday", "last3days", "last7days", "last30days", "thismonth"] as DateRangeKey[]).map((key) => {
                const isActive = dateRange === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDateRange(key)}
                    className={`text-[10px] px-3 py-1.5 rounded-full border transition ${
                      isActive
                        ? "bg-emerald-500 text-slate-900 border-emerald-400"
                        : "bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500"
                    }`}
                    title={DATE_RANGE_OPTIONS.find((o) => o.key === key)?.label || key}
                  >
                    {DATE_RANGE_OPTIONS.find((o) => o.key === key)?.label || key}
                  </button>
                );
              })}
            </div>

            {/* Traffic source selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">
                Traffic Source
              </label>
              <select
                value={trafficSourceFilter}
                onChange={(e) =>
                  setTrafficSourceFilter(e.target.value)
                }
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs min-w-[160px]"
              >
                <option value="all">All sources</option>
                {trafficSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            {/* View mode selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">View</label>
              <select
                value={viewMode}
                onChange={(e)=> setViewMode(e.target.value as ViewMode)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs min-w-[140px]"
              >
                <option value="standard">Standard</option>
                <option value="charts">Charts</option>
              </select>
            </div>
          </div>

          {refreshing && (
            <div className="flex items-center justify-end">
              <span className="text-[11px] text-slate-400">Updating…</span>
            </div>
          )}

          {/* Custom date pickers */}
          {dateRange === "custom" && (
            <div className="flex flex-wrap gap-3 items-end justify-end">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  From
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  To
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main tabs now live in sticky navbar */}

      {/* KPI cards (always visible) */}
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 flex flex-col gap-1 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400">
              {kpi.label}
            </div>
            <div className="text-lg font-semibold">{kpi.value}</div>
            {kpi.delta !== "–" && (
              <div
                className={`text-xs ${
                  kpi.positive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {kpi.delta}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Tabs content */}
      {activeTab === "dashboard" && (
        <DashboardTab
          data={data}
          filteredCampaigns={filteredCampaigns}
          selectedCampaign={selectedCampaign}
          selectedCampaignId={selectedCampaignId}
          setSelectedCampaignId={setSelectedCampaignId}
          zones={zones}
          creatives={creatives}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatLoading={chatLoading}
          setChatInput={setChatInput}
          sendChat={sendChat}
          viewMode={viewMode}
        />
      )}

      {activeTab === "optimizer" && can("optimizer") && (
        <OptimizerTab
          data={data}
          trafficSourceFilter={trafficSourceFilter}
          previewLoading={optimizerPreviewLoading}
          applyLoading={optimizerApplyLoading}
          previewResult={optimizerPreviewResult}
          status={optimizerStatus}
          dryRun={optimizerDryRun}
          setDryRun={setOptimizerDryRun}
          runPreview={runOptimizerPreview}
          runApply={runOptimizerApply}
          blacklistedZones={blacklistedZones}
          clearBlacklist={async () => {
            try {
              const res = await fetch("/api/optimizer/blacklist-log", { method: "DELETE" });
              if (!res.ok) throw new Error(String(res.status));
              refreshBlacklist();
            } catch {
              setBlacklistedZones([]);
              try { localStorage.removeItem("blacklistedZones"); } catch {}
            }
          }}
          refreshBlacklist={refreshBlacklist}
          handleSync={handleSync}
          syncLoading={syncLoading}
        />
      )}

      {activeTab === "creatives" && can("creatives") && (
        <CreativesTab />
      )}

      {activeTab === "builder" && can("builder") && (
        <CampaignBuilderTab />
      )}

      {activeTab === "audit" && currentUser?.role === "admin" && (
        <AuditTrailTab />
      )}
      {activeTab === "updates" && currentUser?.role === "admin" && (
        <UpdatesTab />
      )}
      </div>
    </main>
  );
}

/**
 * Updates tab (admin only)
 */
function UpdatesTab() {
  const [entries, setEntries] = useState<Array<{ id: string; title: string; kind: string; content: string; createdAt: string; author?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"feature" | "fix" | "note">("feature");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/updates", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json?.items)) setEntries(json.items);
      else setError(json?.error || `Failed to load (${res.status})`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addEntry = async () => {
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind, content }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Add failed (${res.status}): ${txt}`);
      }
      setTitle("");
      setKind("feature");
      setContent("");
      fetchEntries();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const removeEntry = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/updates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      fetchEntries();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-2">Team Updates</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Title" className="px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-slate-200" />
          <select value={kind} onChange={(e)=>setKind(e.target.value as any)} className="px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-slate-200">
            <option value="feature">Feature</option>
            <option value="fix">Fix</option>
            <option value="note">Note</option>
          </select>
          <button onClick={addEntry} disabled={loading || !title.trim() || !content.trim()} className="px-4 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">{loading?"Saving…":"Add update"}</button>
        </div>
        <textarea value={content} onChange={(e)=>setContent(e.target.value)} placeholder="Write the update details…" className="mt-3 w-full min-h-28 px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-slate-200" />
        {error && <p className="text-[11px] text-rose-400 mt-2">{error}</p>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Recent entries</h3>
          <span className="text-[10px] text-slate-500">{entries.length} total</span>
        </div>
        {entries.length === 0 ? (
          <div className="p-4 text-[11px] text-slate-500">No updates yet.</div>
        ) : (
          <div className="max-h-80 overflow-auto text-[12px]">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="text-left p-2 w-28">When</th>
                  <th className="text-left p-2 w-24">Type</th>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Details</th>
                  <th className="text-right p-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id || i}>
                    <td className="p-2 align-top text-[11px] text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="p-2 align-top"><span className={`px-2 py-0.5 rounded text-[11px] ${e.kind === 'feature' ? 'bg-emerald-600/20 text-emerald-300' : e.kind === 'fix' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-600/20 text-slate-300'}`}>{e.kind}</span></td>
                    <td className="p-2 align-top text-slate-200">{e.title}</td>
                    <td className="p-2 align-top text-slate-300 whitespace-pre-wrap">{e.content}</td>
                    <td className="p-2 align-top text-right">
                      <button onClick={()=>removeEntry(e.id)} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Small stat component for campaign details
 */
function DetailStat({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
        <span>{label}</span>
        {hint && (
          <span
            className="inline-block w-4 h-4 rounded-full border border-slate-600 text-[9px] leading-4 text-slate-300 text-center cursor-help"
            title={hint}
          >
            ?
          </span>
        )}
      </div>
      <div className={`text-sm font-medium ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

/**
 * Campaign Builder tab
 */
function CampaignBuilderTab(props?: {}) {
  const [provider, setProvider] = useState<string>("propellerads");
  const [name, setName] = useState<string>("");
  const [format, setFormat] = useState<string>("push-classic");
  const [country, setCountry] = useState<string>("");
  const [bid, setBid] = useState<string>("");
  const [dailyBudget, setDailyBudget] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [device, setDevice] = useState<string>("all");
  // Voluum-specific
  const [voluumCreate, setVoluumCreate] = useState<boolean>(false);
  const [voluumTrafficSource, setVoluumTrafficSource] = useState<string>("");
  const [destinationUrl, setDestinationUrl] = useState<string>("");
  const [creativeTitle, setCreativeTitle] = useState<string>("");
  const [creativeDesc, setCreativeDesc] = useState<string>("");
  const [creativeImage, setCreativeImage] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setResult(null);
    setErrorMsg(null);
    try {
      const payload = {
        provider,
        name: name.trim(),
        format,
        country: country.trim().toUpperCase(),
        bid: Number(bid || 0),
        dailyBudget: Number(dailyBudget || 0),
        totalBudget: totalBudget ? Number(totalBudget) : null,
        device,
        creative: {
          title: creativeTitle,
          description: creativeDesc,
          imageUrl: creativeImage || null,
        },
        dryRun,
      };

      if (!payload.name) throw new Error("Campaign name is required");
      if (!payload.country) throw new Error("Country is required (e.g., MX)");
      if (!payload.bid || payload.bid <= 0) throw new Error("Bid must be > 0");
      if (!payload.dailyBudget || payload.dailyBudget <= 0)
        throw new Error("Daily budget must be > 0");

      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `Create failed (${res.status})`);
      }
      const output: any = { provider: json };

      if (voluumCreate) {
        // build a minimal Voluum payload
        const voluumBody = {
          name: payload.name,
          trafficSource: voluumTrafficSource || undefined,
          country: payload.country,
          bid: payload.bid,
          dailyBudget: payload.dailyBudget,
          totalBudget: payload.totalBudget,
          destinationUrl: destinationUrl || undefined,
          dryRun, // mirror dryRun
        };
        const vres = await fetch("/api/voluum/campaigns/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(voluumBody),
        });
        const vjson = await vres.json().catch(() => ({}));
        if (!vres.ok) {
          throw new Error(vjson?.message || vjson?.error || `Voluum create failed (${vres.status})`);
        }
        output.voluum = vjson;
      }

      setResult(JSON.stringify(output, null, 2));
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Campaign Builder</h3>
          <p className="text-[11px] text-slate-400">Draft and (optionally) create campaigns via provider APIs.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Provider</label>
            <select
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="propellerads">PropellerAds</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Ad format</label>
            <select
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {Object.entries(AD_TYPES).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-[10px] uppercase text-slate-500">Campaign name</label>
            <input
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Casino MX – Push – Angle A"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Country (ISO)</label>
            <input
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="MX, MY, US"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Device</label>
            <select
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            >
              <option value="all">All</option>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </div>

          {/* Voluum fields */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Voluum traffic source (name or id)</label>
            <input
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={voluumTrafficSource}
              onChange={(e) => setVoluumTrafficSource(e.target.value)}
              placeholder="e.g., PropellerAds"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Destination URL (offer/tracker)</label>
            <input
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Bid (USD)</label>
            <input
              type="number"
              step="0.001"
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={bid}
              onChange={(e) => setBid(e.target.value)}
              placeholder="0.01"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Daily budget (USD)</label>
            <input
              type="number"
              step="1"
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              placeholder="50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-slate-500">Total budget (USD – optional)</label>
            <input
              type="number"
              step="1"
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="500"
            />
          </div>

          <div className="sm:col-span-2 grid gap-2">
            <div className="grid gap-1">
              <label className="text-[10px] uppercase text-slate-500">Creative title</label>
              <input
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                value={creativeTitle}
                onChange={(e) => setCreativeTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-[10px] uppercase text-slate-500">Creative description</label>
              <textarea
                rows={2}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                value={creativeDesc}
                onChange={(e) => setCreativeDesc(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-[10px] uppercase text-slate-500">Creative image URL</label>
              <input
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                value={creativeImage}
                onChange={(e) => setCreativeImage(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-emerald-500"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry run (don’t create live)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-emerald-500"
              checked={voluumCreate}
              onChange={(e) => setVoluumCreate(e.target.checked)}
            />
            Also create in Voluum
          </label>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-xs px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : dryRun ? "Preview payload" : "Create campaign"}
          </button>
        </div>

        {(errorMsg || result) && (
          <div className="mt-3">
            {errorMsg && (
              <p className="text-[11px] text-rose-400 whitespace-pre-wrap">{errorMsg}</p>
            )}
            {result && (
              <pre className="text-[10px] bg-slate-950 border border-slate-800 rounded-md p-2 overflow-auto max-h-60">{result}</pre>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">Notes</h4>
        <ul className="list-disc pl-5 text-[11px] text-slate-400 space-y-1">
          <li>Currently supports PropellerAds (scaffold). Set PROPELLER_API_TOKEN to enable live create later.</li>
          <li>Voluum creation uses your VOLUUM_* credentials; live create is scaffolded and returns a dry-run preview for now.</li>
          <li>Use the Creatives tab to generate copy/images, then paste here.</li>
          <li>Dry run returns the exact JSON we would send.</li>
        </ul>
      </div>
    </section>
  );
}

/**
 * Dashboard tab
 */
function DashboardTab(props: {
  data: DashboardData;
  filteredCampaigns: Campaign[];
  selectedCampaign: Campaign | null;
  selectedCampaignId: string | null;
  setSelectedCampaignId: (id: string | null) => void;
  zones: Zone[];
  creatives: Creative[];
  chatMessages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  viewMode: ViewMode;
}) {
  const {
    data,
    filteredCampaigns,
    selectedCampaign,
    selectedCampaignId,
    setSelectedCampaignId,
    zones,
    creatives,
    chatMessages,
    chatInput,
    chatLoading,
    setChatInput,
    sendChat,
    viewMode,
  } = props;

  // Trends resolution toggle
  const [trendResolution, setTrendResolution] = useState<"weekly" | "daily">("weekly");

  // Filter series to the currently selected dashboard range
  const seriesInRange = useMemo(() => {
    const src = data?.series ?? [];
    if (!Array.isArray(src) || src.length === 0) return [] as SeriesPoint[];
    const fromTs = new Date(data.from).getTime();
    const toTs = new Date(data.to).getTime();
    return src.filter((p) => {
      const t = new Date(p.date).getTime();
      return !isNaN(t) && t >= fromTs && t <= toTs;
    });
  }, [data?.series, data.from, data.to]);

  // Aggregate daily series into weekly series (Mon–Sun ISO weeks)
  const weeklySeries = useMemo(() => {
    const src = seriesInRange;
    if (!Array.isArray(src) || src.length === 0) return [] as SeriesPoint[];
    const byKey = new Map<string, { date: string; cost: number; revenue: number; profit: number; signups: number; deposits: number }>();
    for (const p of src) {
      const d = new Date(p.date);
      if (isNaN(d.getTime())) continue;
      // ISO week start (Monday)
      const day = d.getDay(); // 0..6, Sun=0
      const diffToMon = (day + 6) % 7; // days since Monday
      const sow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      sow.setUTCDate(sow.getUTCDate() - diffToMon);
      sow.setUTCHours(0, 0, 0, 0);
      const key = sow.toISOString().slice(0, 10); // YYYY-MM-DD (Mon)
      const cur = byKey.get(key) || { date: key, cost: 0, revenue: 0, profit: 0, signups: 0, deposits: 0 };
      cur.cost += p.cost || 0;
      cur.revenue += p.revenue || 0;
      cur.profit += p.profit || (p.revenue || 0) - (p.cost || 0);
      cur.signups += p.signups || 0;
      cur.deposits += p.deposits || 0;
      byKey.set(key, cur);
    }
    const out = Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
    return out.map((r) => ({
      date: r.date,
      cost: r.cost,
      revenue: r.revenue,
      profit: r.profit,
      signups: r.signups,
      deposits: r.deposits,
      cpa: r.deposits > 0 ? r.cost / r.deposits : null,
      cpr: r.signups > 0 ? r.cost / r.signups : null,
    }));
  }, [seriesInRange]);

  // Daily series (already in range)
  const dailySeries = seriesInRange;

  // Range aggregates to keep cards in sync with top-level stats
  const rangeTotals = useMemo(() => {
    const src = seriesInRange;
    if (!Array.isArray(src) || src.length === 0) {
      return { cost: 0, revenue: 0, profit: 0, signups: 0, deposits: 0, cpa: 0, cpr: 0 };
    }
    let cost = 0, revenue = 0, profit = 0, signups = 0, deposits = 0;
    for (const p of src) {
      cost += p.cost || 0;
      revenue += p.revenue || 0;
      // Prefer explicit profit from series; else derive
      profit += (typeof p.profit === "number" ? p.profit : ((p.revenue || 0) - (p.cost || 0)));
      signups += p.signups || 0;
      deposits += p.deposits || 0;
    }
    const cpa = deposits > 0 ? cost / deposits : 0;
    const cpr = signups > 0 ? cost / signups : 0;
    return { cost, revenue, profit, signups, deposits, cpa, cpr };
  }, [seriesInRange]);

  // Guided tour for Creative Doctor (hooks must be declared before any conditional returns)
  const [doctorTourOpen, setDoctorTourOpen] = useState<boolean>(false);
  const [doctorTourStep, setDoctorTourStep] = useState<number>(0);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const descRef = useRef<HTMLDivElement | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);
  const makePromptAnchorRef = useRef<HTMLDivElement | null>(null);
  const stylePresetRef = useRef<HTMLDivElement | null>(null);
  const refsCharRef = useRef<HTMLDivElement | null>(null);
  const influenceRef = useRef<HTMLDivElement | null>(null);
  const genButtonRef = useRef<HTMLDivElement | null>(null);
  const generatorPromptRef = useRef<HTMLDivElement | null>(null);
  const tourSteps = [
    { key: 'title', ref: titleRef, title: 'Title', body: 'Short, punchy headline. Think offer hook or main claim.' },
    { key: 'desc', ref: descRef, title: 'Description', body: 'Add context or angle. Helps style and visuals.' },
    { key: 'embed', ref: embedRef, title: 'Embed caption', body: 'Renders your Title/Description as on-image text.' },
    { key: 'make', ref: makePromptAnchorRef, title: 'Make Prompt', body: 'Builds a clean Ideogram prompt from your copy.' },
    { key: 'style', ref: stylePresetRef, title: 'Style preset', body: 'Optional mood/look. Leave empty or pick a preset.' },
    { key: 'refs', ref: refsCharRef, title: 'References', body: 'Character refs keep identity. Remix image copies layout/style.' },
    { key: 'influence', ref: influenceRef, title: 'Influence', body: '0–100: lower = subtle style; higher = strong match.' },
    { key: 'promptPreview', ref: generatorPromptRef, title: 'Prompt destination', body: 'Your built prompt appears here before generating.' },
    { key: 'generate', ref: genButtonRef, title: 'Generate assets', body: 'Runs copy + image with current prompt and settings.' },
  ] as const;
  const activeStep = tourSteps[Math.max(0, Math.min(doctorTourStep, tourSteps.length - 1))];
  const [tourBox, setTourBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!doctorTourOpen) return;
    let rafId = 0;
    let scrollTimer: any = null;
    const update = () => {
      const el = activeStep?.ref?.current as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setTourBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setTourBox(null);
      }
      rafId = requestAnimationFrame(update);
    };
    const start = () => {
      const el = activeStep?.ref?.current as HTMLElement | null;
      if (el) {
        try {
          const rect = el.getBoundingClientRect();
          const absoluteTop = rect.top + window.scrollY;
          const targetTop = Math.max(0, absoluteTop - Math.round(window.innerHeight * 0.25));
          window.scrollTo({ top: targetTop, behavior: 'smooth' });
        } catch {}
      }
      // allow scroll to animate, then start updates
      scrollTimer = setTimeout(() => { update(); }, 50);
    };
    start();
    window.addEventListener('resize', update);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (scrollTimer) clearTimeout(scrollTimer);
      window.removeEventListener('resize', update);
    };
  }, [doctorTourOpen, doctorTourStep, activeStep?.ref]);

  // When in Charts view, render a dedicated charts-only layout
  if (viewMode === "charts") {
    const src = trendResolution === "weekly" ? weeklySeries : dailySeries;
    return (
      <section className="grid gap-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Charts view</h3>
              <p className="text-[10px] text-slate-500">{new Date(data.from).toLocaleDateString()} – {new Date(data.to).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-slate-500 hidden md:block">Resolution</div>
              <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
                <button onClick={()=>setTrendResolution("weekly")} className={`text-[10px] px-2 py-1 ${trendResolution==='weekly'?'bg-slate-800 text-slate-200':'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Weekly</button>
                <button onClick={()=>setTrendResolution("daily")} className={`text-[10px] px-2 py-1 ${trendResolution==='daily'?'bg-slate-800 text-slate-200':'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Daily</button>
              </div>
            </div>
          </div>

          {src.length === 0 ? (
            <p className="text-[11px] text-slate-500">No time series available for this range.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TrendCard title="Profit" values={src.map(p=>p.profit)} color="#10b981" formatter={formatMoney} displayValue={rangeTotals.profit} />
              <TrendCard title="Revenue" values={src.map(p=>p.revenue)} color="#22c55e" formatter={formatMoney} displayValue={rangeTotals.revenue} />
              <TrendCard title="Cost" values={src.map(p=>p.cost)} color="#f59e0b" formatter={formatMoney} displayValue={rangeTotals.cost} />
              <TrendCard title="Signups" values={src.map(p=>p.signups)} color="#64748b" formatter={(n)=>formatInteger(n)} displayValue={rangeTotals.signups} />
              <TrendCard title="Deposits" values={src.map(p=>p.deposits)} color="#60a5fa" formatter={(n)=>formatInteger(n)} displayValue={rangeTotals.deposits} />
              <TrendCard title="CPA (per deposit)" values={src.map(p=>p.cpa ?? 0)} color="#06b6d4" formatter={formatMoney} displayValue={rangeTotals.cpa} />
              <TrendCard title="CPR (per signup)" values={src.map(p=>p.cpr ?? 0)} color="#8b5cf6" formatter={formatMoney} displayValue={rangeTotals.cpr} />
            </div>
          )}
          {src.length > 1 && (
            <div className="mt-4">
              <CombinedChart
                data={src}
                metrics={[
                  { key: "profit", label: "Profit", color: "#10b981", formatter: formatMoney, axis: 'left' },
                  { key: "revenue", label: "Revenue", color: "#22c55e", formatter: formatMoney, axis: 'left' },
                  { key: "cost", label: "Cost", color: "#f59e0b", formatter: formatMoney, axis: 'left' },
                  { key: "signups", label: "Signups", color: "#64748b", formatter: (n)=>formatInteger(n), axis: 'right' },
                  { key: "deposits", label: "Deposits", color: "#60a5fa", formatter: (n)=>formatInteger(n), axis: 'right' },
                ]}
                height={240}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
      {/* Left: Campaign list */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Campaigns
          </h2>
          <span className="text-xs text-slate-500">
            Showing {formatInteger(filteredCampaigns.length)} of {formatInteger(data.campaigns.length)}
          </span>
        </div>

        <div className="max-h-[600px] md:max-h-[calc(100vh-280px)] overflow-auto text-xs">
          <table className="w-full border-collapse">
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr className="text-slate-400">
                <th className="text-left p-2">Name</th>
                <th className="text-right p-2">Visits</th>
                <th className="text-right p-2">Signups</th>
                <th className="text-right p-2">Deps</th>
                <th className="text-right p-2">Rev</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-right p-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((c) => {
                const isSelected = c.id === selectedCampaignId;
                return (
                  <tr
                    key={c.id}
                    className={`cursor-pointer ${
                      isSelected
                        ? "bg-slate-800/80"
                        : "hover:bg-slate-900/60"
                    }`}
                    onClick={() => setSelectedCampaignId(c.id)}
                  >
                    <td className="p-2 align-top">
                      <div className="font-medium text-slate-100 line-clamp-2">
                        {c.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {c.trafficSource}
                      </div>
                    </td>
                    <td className="p-2 text-right">{formatInteger(c.visits)}</td>
                    <td className="p-2 text-right">{formatInteger(c.signups)}</td>
                    <td className="p-2 text-right">{formatInteger(c.deposits)}</td>
                    <td className="p-2 text-right">
                      {formatMoney(c.revenue)}
                    </td>
                    <td className="p-2 text-right">
                      {formatMoney(c.cost)}
                    </td>
                    <td
                      className={`p-2 text-right ${
                        c.roi < 0
                          ? "text-rose-400"
                          : c.roi > 0
                          ? "text-emerald-400"
                          : "text-slate-200"
                      }`}
                    >
                      {formatPercent(c.roi)}
                    </td>
                  </tr>
                );
              })}

              {!filteredCampaigns.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-3 text-center text-slate-500 text-xs"
                  >
                    No campaigns for this traffic source / date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Details + Chat */}
      <div className="flex flex-col gap-4">
        {/* Trends block */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Trends ({trendResolution})
            </h3>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-slate-500 hidden md:block">Resolution</div>
              <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
                <button
                  onClick={()=>setTrendResolution("weekly")}
                  className={`text-[10px] px-2 py-1 ${trendResolution==='weekly'?'bg-slate-800 text-slate-200':'bg-slate-900 text-slate-400 hover:text-slate-200'}`}
                >Weekly</button>
                <button
                  onClick={()=>setTrendResolution("daily")}
                  className={`text-[10px] px-2 py-1 ${trendResolution==='daily'?'bg-slate-800 text-slate-200':'bg-slate-900 text-slate-400 hover:text-slate-200'}`}
                >Daily</button>
              </div>
            </div>
          </div>
          {((trendResolution==='weekly'?weeklySeries:dailySeries).length === 0) ? (
            <p className="text-[11px] text-slate-500">No time series available for this range.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <TrendCard
                title="Profit"
                values={(trendResolution==='weekly'?weeklySeries:dailySeries).map((p)=> p.profit)}
                color="#10b981"
                formatter={formatMoney}
                displayValue={rangeTotals.profit}
              />
              <TrendCard
                title="CPA (per deposit)"
                values={(trendResolution==='weekly'?weeklySeries:dailySeries).map((p)=> (p.cpa ?? 0))}
                color="#06b6d4"
                formatter={formatMoney}
                displayValue={rangeTotals.cpa}
              />
              <TrendCard
                title="CPR (per signup)"
                values={(trendResolution==='weekly'?weeklySeries:dailySeries).map((p)=> (p.cpr ?? 0))}
                color="#8b5cf6"
                formatter={formatMoney}
                displayValue={rangeTotals.cpr}
              />
            </div>
          )}
        </div>
        {/* Campaign details */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Campaign details
              </h2>
              {selectedCampaign && (
                <p className="text-xs text-slate-400 mt-1">
                  {selectedCampaign.name}
                </p>
              )}
            </div>

            {selectedCampaign ? (
              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <DetailStat
                    label="Visits"
                    value={formatInteger(selectedCampaign.visits)}
                  />
                  <DetailStat
                    label="Signups"
                    value={formatInteger(selectedCampaign.signups)}
                  />
                  <DetailStat
                    label="Deposits"
                    value={formatInteger(selectedCampaign.deposits)}
                  />
                  <DetailStat
                    label="Revenue"
                    value={formatMoney(selectedCampaign.revenue)}
                  />
                  <DetailStat
                    label="Cost"
                    value={formatMoney(selectedCampaign.cost)}
                  />
                  <DetailStat
                    label="Profit"
                    value={formatMoney(selectedCampaign.profit)}
                    valueClass={
                      selectedCampaign.profit < 0
                        ? "text-rose-400"
                        : selectedCampaign.profit > 0
                        ? "text-emerald-400"
                        : undefined
                    }
                  />
                  <DetailStat
                    label="CPA / deposit"
                    hint="CPA = cost / deposits"
                    value={
                      selectedCampaign.deposits > 0
                        ? formatMoney(selectedCampaign.cpa)
                        : "—"
                    }
                  />
                  <DetailStat
                    label="CPR / signup"
                    hint="CPR = cost / signups"
                    value={
                      selectedCampaign.signups > 0
                        ? formatMoney(selectedCampaign.cpr)
                        : "—"
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-400">
                Select a campaign to see details.
              </div>
            )}
          </div>

          {/* Zones + creatives */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Zones */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Zones breakdown
                </h3>
                <span className="text-[10px] text-slate-500">
                  {formatInteger(zones.length)} zones
                </span>
              </div>

              {zones.length === 0 ? (
                <div className="p-4 text-[11px] text-slate-500">
                  No zone data for this campaign in this range.
                </div>
              ) : (
                <div className="max-h-64 overflow-auto text-[11px]">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-900/80 sticky top-0 z-10">
                      <tr className="text-slate-400">
                        <th className="text-left p-2">Zone</th>
                        <th className="text-right p-2">Visits</th>
                        <th className="text-right p-2">Signups</th>
                        <th className="text-right p-2">Deps</th>
                        <th className="text-right p-2">Rev</th>
                        <th className="text-right p-2">Cost</th>
                        <th className="text-right p-2">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((z) => (
                        <tr key={`${z.id}-${z.visits}-${z.cost}`}>
                          <td className="p-2">
                            {z.id && z.id.trim().length > 0
                              ? z.id
                              : "Unknown zone"}
                          </td>
                          <td className="p-2 text-right">{formatInteger(z.visits)}</td>
                          <td className="p-2 text-right">{formatInteger(z.signups)}</td>
                          <td className="p-2 text-right">{formatInteger(z.deposits)}</td>
                          <td className="p-2 text-right">
                            {formatMoney(z.revenue)}
                          </td>
                          <td className="p-2 text-right">
                            {formatMoney(z.cost)}
                          </td>
                          <td
                            className={`p-2 text-right ${
                              z.roi < 0
                                ? "text-rose-400"
                                : z.roi > 0
                                ? "text-emerald-400"
                                : ""
                            }`}
                          >
                            {formatPercent(z.roi)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Creatives */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Creatives breakdown
                </h3>
                <span className="text-[10px] text-slate-500">
                  {formatInteger(creatives.length)} creatives
                </span>
              </div>

              {creatives.length === 0 ? (
                <div className="p-4 text-[11px] text-slate-500">
                  No creative data for this campaign in this range.
                </div>
              ) : (
                <div className="max-h-64 overflow-auto text-[11px]">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-900/80 sticky top-0 z-10">
                      <tr className="text-slate-400">
                        <th className="text-left p-2">Creative</th>
                        <th className="text-right p-2">Visits</th>
                        <th className="text-right p-2">Signups</th>
                        <th className="text-right p-2">Deps</th>
                        <th className="text-right p-2">Rev</th>
                        <th className="text-right p-2">Cost</th>
                        <th className="text-right p-2">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creatives.map((c, index) => {
                        const label =
                          c.name && c.name.toString().trim().length > 0
                            ? c.name
                            : c.id && c.id.trim().length > 0
                            ? `Creative ${c.id}`
                            : `Unknown creative #${index + 1}`;

                        return (
                          <tr key={`${c.id}-${c.visits}-${c.cost}`}>
                            <td className="p-2">{label}</td>
                            <td className="p-2 text-right">{formatInteger(c.visits)}</td>
                            <td className="p-2 text-right">{formatInteger(c.signups)}</td>
                            <td className="p-2 text-right">{formatInteger(c.deposits)}</td>
                            <td className="p-2 text-right">
                              {formatMoney(c.revenue)}
                            </td>
                            <td className="p-2 text-right">
                              {formatMoney(c.cost)}
                            </td>
                            <td
                              className={`p-2 text-right ${
                                c.roi < 0
                                  ? "text-rose-400"
                                  : c.roi > 0
                                  ? "text-emerald-400"
                                  : ""
                              }`}
                            >
                              {formatPercent(c.roi)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat assistant */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col h-72">
          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Assistant
            </h3>
            <span className="text-[10px] text-slate-500">
              Ask about zones, creatives, or optimization ideas
            </span>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-auto px-4 py-2 space-y-2 text-xs">
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[90%] rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "ml-auto bg-emerald-600/70"
                      : "mr-auto bg-slate-800/80"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 px-3 py-2 flex items-center gap-2">
              <textarea
                rows={1}
                className="flex-1 resize-none bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder='Ask something like “Which zones are burning budget?”'
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="text-xs px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {chatLoading ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Lightweight line chart (SVG) used in Trends */
function MiniLineChart({ values, color = "#10b981", width = 280, height = 84, showGrid = true, showPoints = true }: { values: number[]; color?: string; width?: number; height?: number; showGrid?: boolean; showPoints?: boolean }) {
  const id = useId();
  const padding = 10;
  const w = width;
  const h = height;
  const n = Math.max(0, values.length);
  const domainMin = Math.min(...values, 0);
  const domainMax = Math.max(...values, 1);
  const span = domainMax - domainMin || 1;
  const x = (i: number) => padding + (n <= 1 ? 0 : (i * (w - padding * 2)) / Math.max(1, (n - 1)));
  const y = (v: number) => h - padding - ((v - domainMin) / span) * (h - padding * 2);
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const pathD = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const gradId = `grad_${id}`;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showGrid && (
        <g>
          {[0.25, 0.5, 0.75].map((p, i) => (
            <line key={i} x1={padding} x2={w - padding} y1={padding + (h - padding * 2) * p} y2={padding + (h - padding * 2) * p} stroke="#334155" strokeOpacity="0.4" strokeWidth={1} />
          ))}
        </g>
      )}
      {n > 1 && (
        <path d={`${pathD} L ${x(n - 1)},${y(domainMin)} L ${x(0)},${y(domainMin)} Z`} fill={`url(#${gradId})`} stroke="none" />
      )}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {showPoints && points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.8} fill={color} />
      )}
    </svg>
  );
}

function TrendCard({ title, values, color, formatter, displayValue }: { title: string; values: number[]; color: string; formatter: (n: number) => string; displayValue?: number }) {
  const start = values.length ? values[0] : 0;
  const last = values.length ? values[values.length - 1] : 0;
  const valueToShow = typeof displayValue === "number" ? displayValue : last;
  const absDelta = last - start;
  const pctDelta = start !== 0 ? (absDelta / Math.abs(start)) * 100 : (last !== 0 ? 100 : 0);
  const positive = absDelta >= 0;
  return (
    <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40 hover:bg-slate-950/60 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] tracking-wide uppercase text-slate-400">{title}</div>
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold text-slate-100">{formatter(valueToShow)}</div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${positive ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-rose-300 border-rose-500/30 bg-rose-500/10"}`}>{positive ? "▲" : "▼"} {Math.abs(pctDelta).toFixed(1)}%</span>
        </div>
      </div>
      <MiniLineChart values={values} color={color} showGrid={true} showPoints={true} />
    </div>
  );
}

type CombinedMetric = { key: keyof SeriesPoint; label: string; color: string; formatter: (n: number) => string; axis: 'left' | 'right' };
function CombinedChart({ data, metrics, height = 220 }: { data: SeriesPoint[]; metrics: CombinedMetric[]; height?: number }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(metrics.map(m => [m.key, true]))
  ));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const padding = 32;
  const w = 800; // internal width; SVG will scale to container
  const h = height;
  const n = data.length;
  const enabledMetrics = metrics.filter(m => enabled[m.key]);
  const leftMetrics = enabledMetrics.filter(m => m.axis === 'left');
  const rightMetrics = enabledMetrics.filter(m => m.axis === 'right');
  const x = (i: number) => padding + (n <= 1 ? 0 : (i * (w - padding * 2)) / Math.max(1, n - 1));
  // Compute domains per axis
  const [yMinLeft, yMaxLeft] = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const m of leftMetrics) {
      for (const p of data) {
        const v = (p as any)[m.key] as number | null;
        if (typeof v === 'number') { if (v < min) min = v; if (v > max) max = v; }
      }
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) max = min + 1;
    return [min, max];
  }, [data, leftMetrics]);
  const [yMinRight, yMaxRight] = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const m of rightMetrics) {
      for (const p of data) {
        const v = (p as any)[m.key] as number | null;
        if (typeof v === 'number') { if (v < min) min = v; if (v > max) max = v; }
      }
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) max = min + 1;
    return [min, max];
  }, [data, rightMetrics]);
  const yLeft = (v: number) => h - padding - ((v - yMinLeft) / (yMaxLeft - yMinLeft)) * (h - padding * 2);
  const yRight = (v: number) => h - padding - ((v - yMinRight) / (yMaxRight - yMinRight)) * (h - padding * 2);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (containerRef.current?.firstChild as SVGSVGElement | null)?.getBoundingClientRect();
    if (!rect) return;
    const mx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = (mx - padding) / Math.max(1, (rect.width - padding * 2));
    const idx = Math.round(ratio * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
    setHoverX(mx);
  };

  const onLeave = () => setHoverIdx(null);

  const gridY = [0, 0.25, 0.5, 0.75, 1].map(p => padding + (h - padding * 2) * p);
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
        {metrics.map((m) => (
          <button
            key={m.key as string}
            onClick={() => setEnabled(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
            className={`text-[10px] px-2 py-1 rounded-full border ${enabled[m.key] ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
            style={{ boxShadow: enabled[m.key] ? `inset 0 0 0 2px ${m.color}20` : undefined }}
            aria-pressed={!!enabled[m.key]}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.color }} />{m.label}
          </button>
        ))}
        <div className="ml-auto text-[10px] text-slate-500">Click to toggle series</div>
      </div>
      <div ref={containerRef} onMouseMove={onMove} onMouseLeave={onLeave} className="relative">
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
          {/* Y grid */}
          {gridY.map((gy, i) => (
            <line key={i} x1={padding} x2={w - padding} y1={gy} y2={gy} stroke="#334155" strokeOpacity={i === gridY.length - 1 ? 0.6 : 0.3} strokeWidth={1} />
          ))}
          {/* X grid (ticks) */}
          {n > 1 && Array.from({ length: Math.min(8, n) }).map((_, i) => {
            const idx = Math.round((i / Math.min(7, n - 1)) * (n - 1));
            const xv = x(idx);
            return <line key={`vx${i}`} x1={xv} x2={xv} y1={padding} y2={h - padding} stroke="#334155" strokeOpacity={0.15} />;
          })}
          {/* Lines */}
          {enabledMetrics.map((m) => {
            const d = data
              .map((p, i) => {
                const v = (p as any)[m.key] as number | null;
                const yv = typeof v === 'number' ? (m.axis === 'left' ? yLeft(v) : yRight(v)) : null;
                if (yv === null) return '';
                return `${i === 0 ? 'M' : 'L'}${x(i)},${yv}`;
              })
              .filter(Boolean)
              .join(' ');
            return <path key={m.key as string} d={d} fill="none" stroke={m.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          })}

          {/* Hover cursor + points */}
          {hoverIdx !== null && (
            <g>
              <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padding} y2={h - padding} stroke="#94a3b8" strokeDasharray="4 3" strokeOpacity={0.6} />
              {enabledMetrics.map(m => {
                const v = (data[hoverIdx] as any)[m.key] as number | null;
                if (typeof v !== 'number') return null;
                return <circle key={`pt-${m.key as string}`} cx={x(hoverIdx)} cy={(m.axis==='left'?yLeft(v):yRight(v))} r={3} fill={m.color} />;
              })}
            </g>
          )}

          {/* Left axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const val = yMaxLeft - (yMaxLeft - yMinLeft) * p;
            const fmt = (leftMetrics[0]?.formatter ?? formatMoney);
            return (
              <text key={`ly${i}`} x={padding - 6} y={padding + (h - padding * 2) * p + 3} fontSize={10} fill="#94a3b8" textAnchor="end">{fmt(val)}</text>
            );
          })}
          {/* Right axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const val = yMaxRight - (yMaxRight - yMinRight) * p;
            const fmt = (rightMetrics[0]?.formatter ?? formatInteger);
            return (
              <text key={`ry${i}`} x={(w - padding) + 6} y={padding + (h - padding * 2) * p + 3} fontSize={10} fill="#94a3b8" textAnchor="start">{fmt(val)}</text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoverIdx !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 shadow-lg"
            style={{ left: `${hoverX ?? 0}px`, top: 8 }}
          >
            <div className="text-[10px] text-slate-400 mb-1">{dateFmt(data[hoverIdx].date)}</div>
            {enabledMetrics.map(m => {
              const v = (data[hoverIdx] as any)[m.key] as number | null;
              if (typeof v !== 'number') return null;
              return (
                <div key={`tt-${m.key as string}`} className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color }} />
                  <span className="text-slate-300">{m.label}</span>
                  <span className="ml-auto font-medium">{m.formatter(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Optimizer tab
 */
function OptimizerTab(props: {
  data: DashboardData;
  trafficSourceFilter: string;
  previewLoading: boolean;
  applyLoading: boolean;
  previewResult: { rules: any[]; zonesToPauseNow: any[]; meta?: any } | null;
  status: string | null;
  dryRun: boolean;
  setDryRun: (b: boolean) => void;
  runPreview: () => void;
  runApply: (selectedZones: any[]) => void;
  blacklistedZones: { id?: string; zoneId: string; campaignId: string; timestamp: string; reverted?: boolean; revertedAt?: string | null; verified?: boolean; verifiedAt?: string | null }[];
  clearBlacklist: () => void;
  refreshBlacklist: () => void;
  handleSync: () => void;
  syncLoading: boolean;
}) {
  const {
    data,
    trafficSourceFilter,
    previewLoading,
    applyLoading,
    previewResult,
    status,
    dryRun,
    setDryRun,
    runPreview,
    runApply,
    blacklistedZones,
    clearBlacklist,
    refreshBlacklist,
    handleSync,
    syncLoading,
  } = props;

  // Always show zones sorted by most visits (desc)
  const zonesToPauseRaw = previewResult?.zonesToPauseNow ?? [];
  const zonesToPause = useMemo(() => {
    const list = Array.isArray(zonesToPauseRaw) ? [...zonesToPauseRaw] : [];
    return list.sort((a: any, b: any) => {
      const av = (a?.metrics?.visits ?? a?.visits ?? 0) as number;
      const bv = (b?.metrics?.visits ?? b?.visits ?? 0) as number;
      const v = bv - av;
      if (v !== 0) return v;
      const ac = (a?.metrics?.conversions ?? a?.conversions ?? 0) as number;
      const bc = (b?.metrics?.conversions ?? b?.conversions ?? 0) as number;
      const c = bc - ac;
      if (c !== 0) return c;
      const ar = (a?.metrics?.revenue ?? a?.revenue ?? 0) as number;
      const br = (b?.metrics?.revenue ?? b?.revenue ?? 0) as number;
      return br - ar;
    });
  }, [zonesToPauseRaw]);
  // Selection state for previewed zones
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());
  const zoneKey = (z: any) => `${String(z?.campaignId ?? z?.campaign ?? "")}__${String(z?.zoneId ?? z?.zone ?? "")}`;
  // When preview updates, select all zones by default
  useEffect(() => {
    const next = new Set<string>();
    for (const z of zonesToPause) next.add(zoneKey(z));
    setSelectedZoneIds(next);
  }, [zonesToPause]);
  const selectedZonesCount = useMemo(() => {
    if (!zonesToPause.length) return 0;
    let c = 0;
    for (const z of zonesToPause) if (selectedZoneIds.has(zoneKey(z))) c++;
    return c;
  }, [zonesToPause, selectedZoneIds]);
  const allZonesSelected = zonesToPause.length > 0 && selectedZonesCount === zonesToPause.length;
  const toggleZoneSelection = (key: string) => {
    setSelectedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAllZones = () => {
    if (!zonesToPause.length) { setSelectedZoneIds(new Set()); return; }
    if (allZonesSelected) { setSelectedZoneIds(new Set()); return; }
    const next = new Set<string>();
    for (const z of zonesToPause) next.add(zoneKey(z));
    setSelectedZoneIds(next);
  };
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const toggleSelected = (id?: string, enabled?: boolean) => {
    if (!id || enabled === false) return;
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const revertSelected = async () => {
    const items = blacklistedZones.filter((b)=> b.id && !b.reverted && selectedIds[b.id]).map((b)=> ({ id: b.id, zoneId: b.zoneId, campaignId: b.campaignId }));
    if(items.length===0) return;
    try { await fetch("/api/optimizer/unblacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items })}); setSelectedIds({}); refreshBlacklist(); } catch {}
  };

  // Verify toast/state
  const [verifyBusy, setVerifyBusy] = useState<boolean>(false);
  const [verifyToast, setVerifyToast] = useState<null | { kind: "info" | "success" | "error"; msg: string }>(null);
  const showVerifyToast = (msg: string, kind: "info" | "success" | "error" = "info") => {
    setVerifyToast({ kind, msg });
  };

  // Sync-all toggle + toast
  const [syncAll, setSyncAll] = useState<boolean>(false);
  const [syncAllBusy, setSyncAllBusy] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<null | { kind: "info" | "success" | "error"; msg: string }>(null);
  const showSyncToast = (msg: string, kind: "info" | "success" | "error" = "info") => setSyncToast({ kind, msg });

  // Campaign → Provider ID mapping (KV-backed)
  const [mapLoading, setMapLoading] = useState<boolean>(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mapDrafts, setMapDrafts] = useState<Record<string, string>>({});
  const optimCampaigns = useMemo(() => (data?.campaigns || []).map(c => ({ id: c.id, name: c.name })).slice(0, 50), [data]);
  const guessIdFromName = (name?: string) => {
    if (!name) return "";
    const m = name.match(/\d{6,}/);
    return m ? m[0] : "";
  };
  const loadMapping = useCallback(async () => {
    try {
      setMapLoading(true);
      const res = await fetch("/api/optimizer/mappings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.mapping) setMapping(json.mapping);
    } finally {
      setMapLoading(false);
    }
  }, []);
  useEffect(() => { loadMapping(); }, [loadMapping]);
  const saveOneMapping = async (dashboardId: string, providerId: string) => {
    if (!dashboardId || !providerId) return;
    try {
      const dashboardName = optimCampaigns.find(c=>c.id===dashboardId)?.name;
      const res = await fetch("/api/optimizer/mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dashboardId, providerId, dashboardName }) });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.mapping) setMapping(j.mapping);
      }
    } catch {}
  };

  // Provider campaigns list
  const [provLoading, setProvLoading] = useState<boolean>(false);
  const [provItems, setProvItems] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const loadProvider = async () => {
    try {
      setProvLoading(true);
      const res = await fetch("/api/optimizer/propeller/campaigns", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.items)) setProvItems(json.items);
    } finally { setProvLoading(false); }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-1">
            Auto-Pause Optimizer
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Generate rules from the current dashboard view and preview which
            zones would be paused. Then optionally apply them to PropellerAds.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Scope:{" "}
            <span className="font-medium text-slate-200">
              {trafficSourceFilter === "all"
                ? "All traffic sources"
                : trafficSourceFilter}
            </span>{" "}
            • Date:{" "}
            <span className="font-medium text-slate-200">
              {data.dateRange}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={runPreview}
              disabled={previewLoading}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
            >
              {previewLoading ? "Generating…" : "Generate pause plan"}
            </button>
            <button
              onClick={() => runApply(zonesToPause.filter((z:any)=> selectedZoneIds.has(zoneKey(z))))}
              disabled={
                applyLoading ||
                !previewResult ||
                ((previewResult?.zonesToPauseNow?.length ?? 0) === 0) ||
                selectedZonesCount === 0
              }
              className="px-4 py-2 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
            >
              {applyLoading
                ? dryRun
                  ? "Dry run…"
                  : "Applying…"
                : dryRun
                ? "Run dry-run apply"
                : "Apply to traffic source"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-emerald-500"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry run only (don’t actually pause zones)
          </label>
          {status && (
            <p className="text-[11px] text-slate-300 max-w-sm text-right">
              {status}
            </p>
          )}
        </div>
      </div>

      {/* Rules + zones */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">
            Suggested rules
          </h3>
          {!previewResult || previewResult.rules.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Run a preview to see suggested rules.
            </p>
          ) : (
            <ul className="space-y-2">
              {previewResult.rules.map((r, idx) => (
                <li
                  key={idx}
                  className="border border-slate-800 rounded-md p-2 bg-slate-950/40"
                >
                  <div className="text-[11px] font-semibold text-slate-200">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {r.condition}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {r.rationale}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Zones flagged to pause
            </h3>
            <span className="text-[10px] text-slate-500">
              {formatInteger(zonesToPause.length)} zones • {formatInteger(selectedZonesCount)} selected
            </span>
          </div>

          {zonesToPause.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Run a preview to see which zones would be paused.
            </p>
          ) : (
            <div className="max-h-56 overflow-auto">
              <table className="w-full border-collapse">
                <thead className="bg-slate-900/80 sticky top-0 z-10">
                  <tr className="text-slate-400">
                    <th className="text-left p-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Toggle all zones"
                        checked={allZonesSelected}
                        onChange={toggleAllZones}
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </th>
                    <th className="text-left p-2">Campaign</th>
                    <th className="text-left p-2">Zone</th>
                    <th className="text-right p-2">Visits ▼</th>
                    <th className="text-right p-2">Signups</th>
                    <th className="text-right p-2">Deps</th>
                    <th className="text-right p-2">Cost</th>
                    <th className="text-right p-2">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {zonesToPause.map((z: any, idx: number) => {
                    const key = zoneKey(z);
                    const isChecked = selectedZoneIds.has(key);
                    return (
                      <tr key={idx}>
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            aria-label={`Select zone ${z.zoneId ?? z.zone ?? ""}`}
                            checked={isChecked}
                            onChange={() => toggleZoneSelection(key)}
                            className="h-4 w-4 accent-emerald-500"
                          />
                        </td>
                        <td className="p-2 text-[11px]">
                          {z.campaignName ?? z.campaignId}
                        </td>
                        <td className="p-2 text-[11px]">
                          {z.zoneId ?? z.zone ?? "—"}
                        </td>
                        <td className="p-2 text-right text-[11px]">
                          {formatInteger(z.metrics?.visits ?? z.visits ?? 0)}
                        </td>
                        <td className="p-2 text-right text-[11px]">
                          {formatInteger(z.metrics?.signups ?? z.signups ?? 0)}
                        </td>
                        <td className="p-2 text-right text-[11px]">
                          {formatInteger(z.metrics?.deposits ?? z.deposits ?? 0)}
                        </td>
                        <td className="p-2 text-right text-[11px]">
                          {formatMoney(
                            z.metrics?.cost ?? z.cost ?? 0
                          )}
                        </td>
                        <td className="p-2 text-right text-[11px]">
                          {formatPercent(
                            z.metrics?.roi ?? z.roi ?? -100
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Blacklisted zones history */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Blacklisted zones (history)</h3>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>{formatInteger(blacklistedZones.length)} entries</span>
            <button
              onClick={async () => {
                if (syncAll) {
                  if (syncAllBusy) return;
                  setSyncAllBusy(true);
                  showSyncToast("Syncing all provider campaigns…", "info");
                  try {
                    const res = await fetch("/api/optimizer/sync-blacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, dryRun: false }) });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      showSyncToast(`Sync all failed (${res.status})`, "error");
                    } else {
                      const added = typeof json?.added === "number" ? json.added : 0;
                      const campaigns = typeof json?.campaigns === "number" ? json.campaigns : 0;
                      showSyncToast(`Sync all complete: ${added} zone(s) added from ${campaigns} campaign(s).`, "success");
                    }
                    refreshBlacklist();
                  } catch {
                    showSyncToast("Sync all failed.", "error");
                  } finally {
                    setSyncAllBusy(false);
                  }
                } else {
                  void handleSync();
                }
              }}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
              title="Pull zones from provider and store in history"
            >
              {(syncLoading || syncAllBusy) ? "Syncing..." : (syncAll ? "Sync ALL from provider" : "Sync from provider")}
            </button>
            <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-emerald-500" checked={syncAll} onChange={(e)=>setSyncAll(e.target.checked)} /> Sync all provider campaigns</label>
            <button
              onClick={async ()=>{
                setVerifyBusy(true);
                try{
                  const res = await fetch("/api/optimizer/verify", { method: "POST", headers: { "Content-Type": "application/json" } });
                  const json = await res.json().catch(()=>({}));
                  if (!res.ok) {
                    showVerifyToast(`Verify failed (${res.status})`, "error");
                  } else if (json?.ok === false && json?.error === "missing_token") {
                    showVerifyToast("Cannot verify: provider token is missing.", "error");
                  } else {
                    const stats = json?.entries || {};
                    const cams = json?.campaigns || {};
                    const parts: string[] = [];
                    parts.push(`Campaigns processed: ${cams.processed ?? 0}${typeof cams.total === 'number' ? ` / ${cams.total}` : ''}`);
                    if (typeof cams.skipped === 'number' && cams.skipped > 0) parts.push(`Campaigns skipped: ${cams.skipped}`);
                    parts.push(`Entries checked: ${stats.checked ?? 0}`);
                    parts.push(`Verified present: ${stats.verifiedTrue ?? 0}`);
                    parts.push(`Not found: ${stats.verifiedFalse ?? 0}`);
                    
                    // Add debug info
                    if (json?.debug) {
                      parts.push(`\nProvider zones per campaign:`);
                      for (const [cid, info] of Object.entries(json.debug as any)) {
                        const debugInfo = info as { total: number; sample: string[]; checking: string[]; providerZones: string[] };
                        parts.push(`  Campaign ${cid}: ${debugInfo.total} zones in provider`);
                        if (debugInfo.checking?.length > 0) {
                          parts.push(`    Checking for: ${debugInfo.checking.slice(0, 5).join(', ')}${debugInfo.checking.length > 5 ? '...' : ''}`);
                        }
                        if (debugInfo.total > 0 && debugInfo.sample?.length > 0) {
                          parts.push(`    Provider has: ${debugInfo.sample.slice(0, 5).join(', ')}${debugInfo.total > 5 ? '...' : ''}`);
                        }
                      }
                    }
                    
                    showVerifyToast(`Verify complete.\n${parts.join("\n")}`, "success");
                  }
                  refreshBlacklist();
                } catch {
                  showVerifyToast("Verify failed.", "error");
                } finally {
                  setVerifyBusy(false);
                }
              }}
              disabled={verifyBusy}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
            >
              {verifyBusy ? "Verifying…" : "Verify now"}
            </button>
            <button
              onClick={revertSelected}
              disabled={blacklistedZones.filter((b)=> b.id && !b.reverted && selectedIds[b.id]).length===0}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
            >
              Revert selected
            </button>
            <button
              onClick={async () => {
                const items = blacklistedZones.filter((b)=>b.id).slice(0,1).map((b)=>({ id: b.id, zoneId: b.zoneId, campaignId: b.campaignId }));
                if(items.length===0) return;
                try { await fetch("/api/optimizer/unblacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items })}); refreshBlacklist(); } catch {}
              }}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
              title="Revert first item (quick)"
            >
              Revert first
            </button>
            <button
              onClick={async () => {
                try {
                  await fetch("/api/optimizer/blacklist-log", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ zoneId: "TEST-ZONE", campaignId: "TEST-CAMPAIGN", reason: "ui-test" }),
                  });
                  refreshBlacklist();
                } catch {}
              }}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
              title="Temporary: add a test entry to verify KV"
            >
              Add test entry
            </button>
            <button
              onClick={clearBlacklist}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Clear
            </button>
          </div>
        </div>
        {blacklistedZones.length === 0 ? (
          <p className="text-[11px] text-slate-500">No blacklisted zones recorded yet.</p>
        ) : (
          <div className="max-h-56 overflow-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="p-2 w-8"></th>
                  <th className="text-left p-2">Zone</th>
                  <th className="text-left p-2">Campaign</th>
                  <th className="text-left p-2">Blacklisted at</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Verified</th>
                  <th className="text-left p-2">Last Checked</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blacklistedZones.map((b, i) => (
                  <tr key={`${b.zoneId}-${b.timestamp}-${i}`}>
                    <td className="p-2 w-8"><input type="checkbox" className="accent-emerald-500" checked={!!(b.id && selectedIds[b.id])} onChange={()=>toggleSelected(b.id, !b.reverted)} disabled={!b.id || b.reverted} /></td>
                    <td className="p-2">{b.zoneId}</td>
                    <td className="p-2">{b.campaignId}</td>
                    <td className="p-2">{formatDateTimeGMT8(b.timestamp)}</td>
                    <td className="p-2">{b.reverted ? (<span className="text-amber-400">Reverted</span>) : (<span className="text-emerald-400">Active</span>)}</td>
                    <td className="p-2">
                      {b.verified ? (
                        <span className="text-emerald-400" title={`Present in provider blacklist. Checked: ${b.verifiedAt || 'N/A'}`}>✓ In Provider</span>
                      ) : b.verifiedAt ? (
                        <span className="text-slate-500" title={`Not found in provider blacklist. Checked: ${b.verifiedAt}`}>✗ Not Found</span>
                      ) : (
                        <span className="text-slate-600" title="Not yet verified">—</span>
                      )}
                    </td>
                    <td className="p-2 text-[11px]">{b.verifiedAt ? formatDateTimeGMT8(b.verifiedAt) : (<span className="text-slate-600">—</span>)}</td>
                    <td className="p-2 text-right">
                      <button
                        onClick={async ()=>{ if(!b.id || b.reverted) return; try{ await fetch("/api/optimizer/unblacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items:[{ id:b.id, zoneId:b.zoneId, campaignId:b.campaignId }] })}); refreshBlacklist(); }catch{} }}
                        disabled={!b.id || b.reverted}
                        className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Revert
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {verifyToast && (
        <div className={`fixed bottom-4 right-4 z-50 px-3 py-2 rounded-md text-[11px] shadow-lg border ${verifyToast.kind === 'success' ? 'bg-emerald-900/80 text-emerald-100 border-emerald-700' : verifyToast.kind === 'error' ? 'bg-rose-900/80 text-rose-100 border-rose-700' : 'bg-slate-900/80 text-slate-100 border-slate-700'}`}>
          <div className="flex items-start gap-3">
            <pre className="whitespace-pre-wrap break-words m-0">{verifyToast.msg}</pre>
            <button onClick={()=>setVerifyToast(null)} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700">Close</button>
          </div>
        </div>
      )}

      {/* Campaign → Provider ID mapping */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Campaign ID Mapping</h3>
          <div className="flex items-center gap-2">
            <button onClick={loadMapping} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px]">{mapLoading?"Loading…":"Refresh"}</button>
            <button onClick={loadProvider} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px]">{provLoading?"Loading Propeller…":"Load from Propeller"}</button>
            <button onClick={()=>{
              const drafts: Record<string,string> = { ...mapDrafts };
              for (const c of optimCampaigns) {
                if (!drafts[c.id] && !mapping[c.id]) {
                  const g = guessIdFromName(c.name);
                  if (g) drafts[c.id] = g;
                }
              }
              setMapDrafts(drafts);
            }} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px]">Auto-fill guesses</button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">Paste the numeric Propeller campaign ID next to each dashboard campaign. Click Save to store the link so verification uses the right campaign.</p>
        {optimCampaigns.length === 0 ? (
          <p className="text-[11px] text-slate-500">No campaigns in view.</p>
        ) : (
          <div className="max-h-56 overflow-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="text-left p-2">Campaign</th>
                  <th className="text-left p-2">Dashboard ID</th>
                  <th className="text-left p-2">Propeller ID</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {optimCampaigns.map((c) => {
                  const current = mapping[c.id] || "";
                  const draft = mapDrafts[c.id] ?? current ?? "";
                  return (
                    <tr key={c.id}>
                      <td className="p-2 text-[11px] text-slate-200">{c.name}</td>
                      <td className="p-2 text-[10px] text-slate-500">{c.id}</td>
                      <td className="p-2">
                        {provItems.length > 0 ? (
                          <select value={draft} onChange={(e)=> setMapDrafts(prev=>({ ...prev, [c.id]: e.target.value }))} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] max-w-[260px]">
                            <option value="">(Select from Propeller)</option>
                            {provItems.map((p)=> (
                              <option key={p.id} value={p.id}>{p.name} — {p.id}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={draft} onChange={(e)=> setMapDrafts(prev=>({ ...prev, [c.id]: e.target.value.replace(/[^0-9]/g, '') }))} placeholder={guessIdFromName(c.name) || "1234567"} className="w-28 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px]" />
                        )}
                      </td>
                      <td className="p-2 text-right space-x-2">
                        <button className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800" onClick={()=> saveOneMapping(c.id, (mapDrafts[c.id] || '').trim())} disabled={!mapDrafts[c.id] && !current}>Save</button>
                        <button className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800" onClick={async()=>{
                          try {
                            const res = await fetch(`/api/optimizer/propeller/blacklist?dashboardId=${encodeURIComponent(c.id)}`);
                            const j = await res.json().catch(()=>({}));
                            if (!res.ok || j?.ok===false) {
                              showVerifyToast(`Inspect failed${j?.error?`: ${j.error}`:''}`, 'error');
                            } else {
                              const items: string[] = Array.isArray(j.items)? j.items : [];
                              const head = items.slice(0, 20).join(', ');
                              const msg = `Provider campaign ${j.providerCampaignId}\nFound ${j.total} id(s). Showing up to 20:\n${head || '(none)'}`;
                              showVerifyToast(msg, 'info');
                            }
                          } catch {
                            showVerifyToast('Inspect failed', 'error');
                          }
                        }}>Inspect</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {syncToast && (
        <div className={`fixed bottom-20 right-4 z-50 px-3 py-2 rounded-md text-[11px] shadow-lg border ${syncToast.kind === 'success' ? 'bg-emerald-900/80 text-emerald-100 border-emerald-700' : syncToast.kind === 'error' ? 'bg-rose-900/80 text-rose-100 border-rose-700' : 'bg-slate-900/80 text-slate-100 border-slate-700'}`}>
          <div className="flex items-start gap-3">
            <pre className="whitespace-pre-wrap break-words m-0">{syncToast.msg}</pre>
            <button onClick={()=>setSyncToast(null)} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700">Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Creatives tab
 */
function CreativesTab(props?: {}) {
  return (
    <section className="space-y-4">
      <CreativeGallery />
    </section>
  );
}

function AuditTrailTab() {
  const [category, setCategory] = useState<string>("optimizer");
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState<string>("");

  const fetchAudit = async (cat: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit/list?category=${encodeURIComponent(cat)}`, { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudit(category); }, [category]);

  const cats = [
    { key: "all", label: "All" },
    { key: "dashboard", label: "Dashboard" },
    { key: "optimizer", label: "Optimizer" },
    { key: "creatives", label: "Creatives" },
    { key: "builder", label: "Builder" },
    { key: "admin", label: "Admin" },
    { key: "auth", label: "Auth" },
  ];

  const filtered = items.filter((it) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return JSON.stringify(it).toLowerCase().includes(s);
  });

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Audit Trail</h2>
          <p className="text-[11px] text-slate-500">Historical actions grouped by category. Search matches in JSON details.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={category} onChange={(e)=>setCategory(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs">
            {cats.map((c)=>(<option key={c.key} value={c.key}>{c.label}</option>))}
          </select>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search..." className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs min-w-[180px]" />
          <button onClick={()=>fetchAudit(category)} className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Refresh</button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
        {loading ? (
          <p className="text-[11px] text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-slate-500">No audit entries.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="text-left p-2">Time</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it: any, idx: number) => (
                  <tr key={it.id || idx}>
                    <td className="p-2">{formatDateTimeGMT8(it.ts || it.timestamp || new Date().toISOString())}</td>
                    <td className="p-2">{it.category || "-"}</td>
                    <td className="p-2">{it.action || "-"}</td>
                    <td className="p-2"><pre className="whitespace-pre-wrap break-words">{JSON.stringify(it, null, 2)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
