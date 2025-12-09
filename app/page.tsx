"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";

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
  signups: number;   // 👈 NEW
  deposits: number;  // 👈 NEW
  revenue: number;
  cost: number;
  roi: number;
};

type Creative = {
  id: string;
  name?: string | null;
  visits: number;
  conversions: number;
  signups: number;   // 👈 NEW
  deposits: number;  // 👈 NEW
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

type DashboardData = {
  dateRange: string;
  from: string;
  to: string;
  kpis: KPI[];
  campaigns: Campaign[];
};

type DateRangeKey =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "custom";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TabKey = "dashboard" | "optimizer" | "creatives" | "builder" | "audit" | "updates";

/**
 * ===========
 * Config
 * ===========
 */

const DASHBOARD_API_URL = "/api/voluum-dashboard";
const CHAT_API_URL = "/api/chat";
const OPTIMIZER_PREVIEW_URL = "/api/optimizer/preview";
const OPTIMIZER_APPLY_URL = "/api/optimizer/apply";
const CREATIVE_CHAT_API_URL = "/api/creative-doctor";
const CREATIVE_IMAGE_API_URL = "/api/creative-images";
const CREATIVE_ASSETS_API_URL = "/api/creative-assets";
const IMAGE_PROVIDER_DEFAULT = (process.env.NEXT_PUBLIC_IMAGE_PROVIDER as string) || "ideogram";
const AD_TYPES: Record<
  string,
  {
    label: string;
    notes: string;
    mainImageSize: string;
    required: string[];
  }
> = {
  "push-classic": {
    label: "Propeller Push",
    notes: "Title + description + main image (360x240 or square).",
    mainImageSize: "1024x1024",
    required: ["title", "description", "main image"],
  },
  "inpage-push": {
    label: "In-Page Push",
    notes: "Title + description + main image (square or 3:2).",
    mainImageSize: "1024x768",
    required: ["title", "description", "main image"],
  },
  interstitial: {
    label: "Interstitial",
    notes: "Full-screen image; optional title/description.",
    mainImageSize: "1080x1920",
    required: ["main image", "optional copy"],
  },
  onclick: {
    label: "Onclick / Direct Click",
    notes: "Hero image aimed at CTR (1200x628).",
    mainImageSize: "1200x628",
    required: ["main image"],
  },
};

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7days", label: "Last 7 days" },
  { key: "last30days", label: "Last 30 days" },
  { key: "custom", label: "Custom…" },
];

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
          params.set("from", from);
          params.set("to", to);
        } else {
          params.set("dateRange", dateRange);
        }

        const url = `${DASHBOARD_API_URL}?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(`Failed to fetch (${res.status})`);
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
   * Creatives Doctor - chat
   */
  const sendCreativeChat = async (overrideMessage?: string) => {
    const content = (overrideMessage ?? creativeChatInput).trim();
    if (!content || creativeChatLoading) return;

    const newMessages: ChatMessage[] = [
      ...creativeChatMessages,
      { role: "user", content },
    ];
    setCreativeChatMessages(newMessages);
    if (!overrideMessage) setCreativeChatInput("");
    setCreativeChatLoading(true);

    try {
      const res = await fetch(CREATIVE_CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            campaigns: filteredCampaigns,
            selectedCampaignId,
          },
          brandUrl: brandUrl || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Creative doctor failed (${res.status})`);
      }

      const json = await res.json();
      const reply =
        json.reply ??
        json.message ??
        "[No reply field in response from creative doctor API]";

      // Capture brand-aligned Ideogram prompts if provided
      if (Array.isArray(json?.ideogramPrompts)) {
        setIdeogramSuggestions(json.ideogramPrompts);
      }

      // tiny token counter (best-effort)
      const tokensFromServer =
        json.tokenUsage?.total ??
        json.tokens ??
        json.usage?.total_tokens ??
        null;
      if (typeof tokensFromServer === "number") {
        setCreativeTokenCount(tokensFromServer);
      } else {
        // fallback: rough estimate
        setCreativeTokenCount((prev) => prev + Math.ceil(content.length / 4));
      }

      setCreativeChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error(err);
      setCreativeChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Creative Doctor error - check `/api/creative-doctor` on your backend.",
        },
      ]);
    } finally {
      setCreativeChatLoading(false);
    }
  };

const generateImage = async (promptText: string, sizeOverride?: string) => {
    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);

    try {
      let imageRes: Response;
      // Use multipart for Ideogram when advanced fields/files are present
      const useMultipart = imageProvider === "ideogram" && (
        Boolean(stylePreset) || Boolean(negativePrompt) || Boolean(seed) || (charRefFiles && charRefFiles.length > 0) || Boolean(imageRefFile)
      );
      if (useMultipart) {
        const form = new FormData();
        form.append("prompt", promptText);
        form.append("size", sizeOverride || mainImageSize);
        form.append("provider", imageProvider);
        form.append("saveToGallery", String(saveToGallery));
        if (stylePreset) form.append("style_preset", stylePreset);
        if (negativePrompt) form.append("negative_prompt", negativePrompt);
        if (seed) form.append("seed", seed);
        if (Array.isArray(charRefFiles)) {
          for (const f of charRefFiles) {
            if (f) form.append("character_reference_images", f);
          }
        }
        if (imageRefFile) form.append("image", imageRefFile);
        imageRes = await fetch(CREATIVE_IMAGE_API_URL, { method: "POST", body: form });
      } else {
        imageRes = await fetch(CREATIVE_IMAGE_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            size: sizeOverride || mainImageSize,
            provider: imageProvider,
            style_preset: stylePreset || undefined,
            negative_prompt: negativePrompt || undefined,
            seed: seed || undefined,
            saveToGallery,
          }),
        });
      }

      if (!imageRes.ok) {
        const text = await imageRes.text();
        throw new Error(`Image generation failed (${imageRes.status}): ${text}`);
      }

      const imageJson = await imageRes.json();
      const imageResultUrl: string | undefined =
        imageJson.url ?? imageJson.imageUrl ?? imageJson.data?.[0]?.url;
      if (!imageResultUrl) {
        throw new Error("No image URL returned from API.");
      }
      setImageUrl(imageResultUrl);
    } catch (err: any) {
      console.error("Creative image error:", err);
      setImageError(
        err?.message ||
          "Image generation failed. Check `/api/creative-images` and your OpenAI org verification."
      );
    } finally {
      setImageLoading(false);
    }
  };

  const generateCreativeBundle = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt || assetsLoading || imageLoading) return;

    setAssetsLoading(true);
    setAssetsError(null);
    setImageError(null);
    setImageUrl(null);

    try {
      const res = await fetch(CREATIVE_ASSETS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, adType }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Assets generation failed (${res.status}): ${text}`);
      }

      const json = await res.json();

      const newTitle = json.title ?? "";
      const newDescription = json.description ?? "";
      const newMainPrompt =
        json.imagePrompt ?? json.mainImagePrompt ?? prompt;
      const newMainSize =
        json.mainImageSize ?? AD_TYPES[adType]?.mainImageSize ?? "1024x1024";

      setAssetTitle(newTitle);
      setAssetDescription(newDescription);
      setMainImagePrompt(newMainPrompt);
      setMainImageSize(newMainSize);

      await generateImage(newMainPrompt, newMainSize);
    } catch (err: any) {
      console.error("Creative assets error:", err);
      setAssetsError(
        err?.message ||
          "Could not generate assets. Check `/api/creative-assets` and your OpenAI key."
      );
    } finally {
      setAssetsLoading(false);
    }
  };

  /**
   * ===========
   * Render
   * ===========
   */

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-lg font-medium">Loading, BE PATIENT!!</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
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
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div>No data</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            PropellarAds Sidekick
          </h1>
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
        <CreativesTab
          creativeChatMessages={creativeChatMessages}
          creativeChatInput={creativeChatInput}
          creativeChatLoading={creativeChatLoading}
          setCreativeChatInput={setCreativeChatInput}
          sendCreativeChat={sendCreativeChat}
          creativeTokenCount={creativeTokenCount}
          ideogramSuggestions={ideogramSuggestions}
          setIdeogramSuggestions={setIdeogramSuggestions}
          brandUrl={brandUrl}
          setBrandUrl={setBrandUrl}
          imagePrompt={imagePrompt}
          setImagePrompt={setImagePrompt}
          adType={adType}
          setAdType={setAdType}
          assetTitle={assetTitle}
          assetDescription={assetDescription}
          mainImagePrompt={mainImagePrompt}
          mainImageSize={mainImageSize}
          imageLoading={imageLoading}
          imageError={imageError}
          assetsLoading={assetsLoading}
          assetsError={assetsError}
          imageUrl={imageUrl}
          generateCreativeBundle={generateCreativeBundle}
          imageProvider={imageProvider}
          setImageProvider={setImageProvider}
          stylePreset={stylePreset}
          setStylePreset={setStylePreset}
          negativePrompt={negativePrompt}
          setNegativePrompt={setNegativePrompt}
          seed={seed}
          setSeed={setSeed}
          charRefFiles={charRefFiles}
          setCharRefFiles={setCharRefFiles}
          setImageRefFile={setImageRefFile}
          saveToGallery={saveToGallery}
          setSaveToGallery={setSaveToGallery}
        />
      )}

      {activeTab === "builder" && can("builder") && (
        <CampaignBuilderTab
          adType={adType}
          assetTitle={assetTitle}
          assetDescription={assetDescription}
          imageUrl={imageUrl}
        />
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
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`text-sm font-medium ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

/**
 * Campaign Builder tab
 */
function CampaignBuilderTab(props: {
  adType: string;
  assetTitle: string;
  assetDescription: string;
  imageUrl: string | null;
}) {
  const { adType, assetTitle, assetDescription, imageUrl } = props;

  const [provider, setProvider] = useState<string>("propellerads");
  const [name, setName] = useState<string>("");
  const [format, setFormat] = useState<string>(adType || "push-classic");
  const [country, setCountry] = useState<string>("");
  const [bid, setBid] = useState<string>("");
  const [dailyBudget, setDailyBudget] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [device, setDevice] = useState<string>("all");
  // Voluum-specific
  const [voluumCreate, setVoluumCreate] = useState<boolean>(false);
  const [voluumTrafficSource, setVoluumTrafficSource] = useState<string>("");
  const [destinationUrl, setDestinationUrl] = useState<string>("");
  const [creativeTitle, setCreativeTitle] = useState<string>(assetTitle || "");
  const [creativeDesc, setCreativeDesc] = useState<string>(assetDescription || "");
  const [creativeImage, setCreativeImage] = useState<string>(imageUrl || "");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // keep creative defaults in sync when user switches tabs and generates assets
    if (!creativeTitle && assetTitle) setCreativeTitle(assetTitle);
    if (!creativeDesc && assetDescription) setCreativeDesc(assetDescription);
    if (!creativeImage && imageUrl) setCreativeImage(imageUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTitle, assetDescription, imageUrl]);

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
  } = props;

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
                    value={
                      selectedCampaign.deposits > 0
                        ? formatMoney(selectedCampaign.cpa)
                        : "—"
                    }
                  />
                  <DetailStat
                    label="CPR / signup"
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

  const zonesToPause = previewResult?.zonesToPauseNow ?? [];
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
                    <th className="text-right p-2">Visits</th>
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
              onClick={() => { void handleSync(); }}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
              title="Pull zones from provider and store in history"
            >
              {syncLoading ? "Syncing..." : "Sync from provider"}
            </button>
            <button
              onClick={async ()=>{ try{ await fetch("/api/optimizer/verify", { method: "POST" }); refreshBlacklist(); }catch{} }}
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              Verify now
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
                    <td className="p-2">{b.verified ? (<span className="text-emerald-400" title={b.verifiedAt || undefined}>Verified</span>) : (<span className="text-slate-400">—</span>)}</td>
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
    </section>
  );
}

/**
 * Creatives tab
 */
function CreativesTab(props: {
  creativeChatMessages: ChatMessage[];
  creativeChatInput: string;
  creativeChatLoading: boolean;
  setCreativeChatInput: (v: string) => void;
  sendCreativeChat: (overrideMessage?: string) => void;
  creativeTokenCount: number;
  ideogramSuggestions: any[];
  setIdeogramSuggestions: (v: any[]) => void;
  brandUrl: string;
  setBrandUrl: (v: string) => void;
  imagePrompt: string;
  setImagePrompt: (v: string) => void;
  adType: string;
  setAdType: (v: string) => void;
  assetTitle: string;
  assetDescription: string;
  mainImagePrompt: string;
  mainImageSize: string;
  imageLoading: boolean;
  imageError: string | null;
  assetsLoading: boolean;
  assetsError: string | null;
  imageUrl: string | null;
  generateCreativeBundle: () => void;
  imageProvider: string;
  setImageProvider: (v: string) => void;
  stylePreset: string;
  setStylePreset: (v: string) => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
  seed: string;
  setSeed: (v: string) => void;
  charRefFiles: File[];
  setCharRefFiles: (v: File[]) => void;
  setImageRefFile: (v: File | null) => void;
  saveToGallery: boolean;
  setSaveToGallery: (v: boolean) => void;
}) {
  const {
    creativeChatMessages,
    creativeChatInput,
    creativeChatLoading,
    setCreativeChatInput,
    sendCreativeChat,
    creativeTokenCount,
    ideogramSuggestions,
    setIdeogramSuggestions,
    brandUrl,
    setBrandUrl,
    imagePrompt,
    setImagePrompt,
    adType,
    setAdType,
    assetTitle,
    assetDescription,
    mainImagePrompt,
    mainImageSize,
    imageLoading,
    imageError,
    assetsLoading,
    assetsError,
    imageUrl,
    generateCreativeBundle,
    imageProvider,
    setImageProvider,
    stylePreset,
    setStylePreset,
    negativePrompt,
    setNegativePrompt,
    seed,
    setSeed,
    charRefFiles,
    setCharRefFiles,
    setImageRefFile,
    saveToGallery,
    setSaveToGallery,
  } = props;

  // Quick actions for Creative Doctor
  const [doctorTitle, setDoctorTitle] = useState<string>("");
  const [doctorDescription, setDoctorDescription] = useState<string>("");
  const [doctorBusy, setDoctorBusy] = useState<boolean>(false);
  const [embedCaption, setEmbedCaption] = useState<boolean>(true);
  const [brandName, setBrandName] = useState<string>("");
  const [brandColors, setBrandColors] = useState<string>("");
  const [brandStyle, setBrandStyle] = useState<string>("");
  const [brandNegative, setBrandNegative] = useState<string>("");
  const [applyBrand, setApplyBrand] = useState<boolean>(true);

  // Derive a preview list of colors from the comma-/space-separated input
  const colorList = useMemo(() => {
    const raw = (brandColors || "").split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    // If user separated by spaces only, try splitting further but keep hex codes intact
    if (raw.length <= 1) {
      const bySpace = (brandColors || "").split(/\s+/).map((s) => s.trim()).filter(Boolean);
      return Array.from(new Set(bySpace)).slice(0, 20);
    }
    return Array.from(new Set(raw)).slice(0, 20);
  }, [brandColors]);

  const [brandList, setBrandList] = useState<Array<{ id: string; name: string; colors: string[]; style: string; negative?: string }>>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [hasOpenAI, setHasOpenAI] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      try { const r = await fetch("/api/env/openai", { cache: "no-store" }); const j = await r.json(); setHasOpenAI(Boolean(j?.hasOpenAI)); } catch { setHasOpenAI(false); }
    })();
  }, []);
  // Small status toast/spinner for brand indexing/style ops
  const [brandOpBusy, setBrandOpBusy] = useState<boolean>(false);
  const [brandToast, setBrandToast] = useState<null | { kind: "info" | "success" | "error"; msg: string }>(null);
  const [brandProgress, setBrandProgress] = useState<number>(0);
  const [brandStep, setBrandStep] = useState<string>("");
  const brandStreamRef = useRef<EventSource | null>(null);
  const stopBrandStream = useCallback(async (base: string) => {
    try { if (brandStreamRef.current) { brandStreamRef.current.close(); brandStreamRef.current = null; } } catch {}
    try { if (base) await fetch(`/api/brand/status?baseUrl=${encodeURIComponent(base)}`, { method: "DELETE" }); } catch {}
  }, []);
  const startBrandStream = useCallback((base: string) => {
    try {
      if (!base) return;
      const url = `/api/brand/status/stream?baseUrl=${encodeURIComponent(base)}`;
      const es = new EventSource(url);
      brandStreamRef.current = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data || "{}");
          const st = data?.status || null;
          if (st && typeof st.progress === "number") setBrandProgress(st.progress);
          if (st && st.step) setBrandStep(String(st.step));
          if (st && st.progress >= 100) {
            stopBrandStream(base);
          }
        } catch {}
      };
      es.onerror = () => { try { es.close(); } catch {} };
    } catch {}
  }, [stopBrandStream]);
  const showBrandToast = (msg: string, kind: "info" | "success" | "error" = "info") => {
    setBrandToast({ kind, msg });
    // auto-hide after 4s
    try { setTimeout(() => setBrandToast(null), 4000); } catch {}
  };
  const loadBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brand", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const items = Array.isArray(json?.brands) ? json.brands : [];
      if (items.length === 0) {
        await fetch("/api/brand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "SOL88",
            colors: ["#0B1220", "#101826", "#12FFC6", "#FFD54A", "#FFFFFF"],
            style: "High-contrast dark UI; glossy gold accents; teal neon highlights; cinematic rim lighting; realistic chips/cards/roulette; shallow depth of field; subtle bokeh; clean, centered composition; bold display typography; Mexico market flavor (subtle)",
            negative: "pastel, low-contrast, cartoon, watermark, tiny unreadable text, cluttered backgrounds, blurry motion, JPEG artifacts, children imagery",
          }),
        });
        return loadBrands();
      }
      setBrandList(items);
      const b = items[0];
      setSelectedBrandId(b.id);
      setBrandName(b.name || "");
      setBrandColors(Array.isArray(b.colors) ? b.colors.join(", ") : "");
      setBrandStyle(b.style || "");
      setBrandNegative(b.negative || "");
    } catch {}
  }, []);

  const saveBrand = async () => {
    try {
      const res = await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedBrandId || undefined,
          name: brandName,
          colors: brandColors,
          style: brandStyle,
          negative: brandNegative,
        }),
      });
      await loadBrands();
    } catch {}
  };

  const generateIdeogramPromptFromCopy = async () => {
    const titleText = doctorTitle.trim();
    const descText = doctorDescription.trim();
    const brief = [titleText, descText].filter(Boolean).join(" — ");
    if (!brief) return;
    try {
      setDoctorBusy(true);
      const res = await fetch(CREATIVE_ASSETS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: brief, adType }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || String(res.status));
      // Build an Ideogram-friendly prompt that embeds the caption text inside the image.
      const basePrompt = (json?.imagePrompt || json?.mainImagePrompt || brief) as string;
      const adLabel = (AD_TYPES as any)[adType]?.label || adType;
      const captionDirective = embedCaption
        ? ` Render the EXACT caption text inside the image as on-image typography: "${titleText}${descText ? ` — ${descText}` : ""}". Use bold, legible, high-contrast type. No extra text besides the caption. No watermarks.`
        : "";
      const typographyHints = " Clean layout, strong focal point, ad-friendly composition.";
      const styleHint = stylePreset ? ` Style preset: ${stylePreset}.` : "";
      const negAll = [negativePrompt, applyBrand ? brandNegative : ""].filter(Boolean).join(", ");
      const negHint = negAll ? ` Avoid: ${negAll}.` : "";
      const brandHint = applyBrand && (brandName || brandColors || brandStyle)
        ? ` Follow ${brandName || "the brand"} art direction: ${brandStyle || ""}. Palette: ${(brandColors || "").replace(/\s+/g, " ")}.`
        : "";
      const newMainPrompt = `High-converting ${adLabel} visual. ${basePrompt}.${captionDirective}${typographyHints}${styleHint}${brandHint}${negHint}`.replace(/\s+/g, " ").trim();
      setImagePrompt(newMainPrompt);
    } catch (e) {
      // Silent fail in UI; user can still chat or try again
    } finally {
      setDoctorBusy(false);
    }
  };

  const handleQuickPrompt = async () => {
    try {
      const base = (creativeChatInput || imagePrompt || "High-converting creative idea").trim();
      if (!base) return;
      const res = await fetch(CREATIVE_ASSETS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: base, adType }),
      });
      if (!res.ok) {
        // silently ignore in UI; this is a helper
        return;
      }
      const json = await res.json();
      const newMainPrompt = json.imagePrompt || json.mainImagePrompt || base;
      setImagePrompt(newMainPrompt);
    } catch {
      // no-op
    }
  };

  const handleQuickPerfSummary = () => {
    const quick = "Give me a performance summary for the last 7 days. Keep it concise and actionable.";
    sendCreativeChat(quick);
  };

  function LibraryStrip({ mode, onUse }: { mode: "chars" | "image"; onUse: (url: string) => void }) {
    const [items, setItems] = useState<Array<{ id: string; url: string }>>([]);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      (async () => {
        try { const r = await fetch("/api/media", { cache: "no-store" }); const j = await r.json(); const arr = Array.isArray(j?.items) ? j.items.slice(0, 8) : []; setItems(arr); } catch {}
        setLoaded(true);
      })();
    }, []);
    if (!loaded || items.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((it) => (
          <button key={it.id} title="Use from library" onClick={() => onUse(it.url)} className="w-16 h-12 overflow-hidden rounded border border-slate-700 bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="ref" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    );
  }

  // Modal picker for media library
  const [showPicker, setShowPicker] = useState<{ open: boolean; mode: "chars" | "image" }>({ open: false, mode: "chars" });
  const [pickerItems, setPickerItems] = useState<Array<any>>([]);
  const [pickerBrand, setPickerBrand] = useState<string>("");
  const [pickerTag, setPickerTag] = useState<string>("");
  useEffect(() => {
    if (!showPicker.open) return;
    (async () => {
      try { const r = await fetch("/api/media", { cache: "no-store" }); const j = await r.json(); setPickerItems(Array.isArray(j?.items)? j.items : []);} catch {}
    })();
  }, [showPicker.open]);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Creative Doctor chat */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Creative Doctor
            </h3>
            <p className="text-[11px] text-slate-400">
              Generate on-brand, high-converting Ideogram prompts. Enter a Title and Description, tune your Brand Style, and optionally embed the caption as in‑image text.
            </p>
          </div>
          <div className="flex items-center gap-2"></div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Title + Description -> Ideogram Prompt helper */}
          <div className="px-4 py-2 border-b border-slate-800 grid gap-2 md:grid-cols-12 items-end">
            <div className="md:col-span-3">
              <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Title</label>
              <input value={doctorTitle} onChange={(e)=>setDoctorTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs" placeholder="Eg. Win big today" />
            </div>
            <div className="md:col-span-7">
              <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Description</label>
              <input value={doctorDescription} onChange={(e)=>setDoctorDescription(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs" placeholder="Eg. Deposit bonus, instant withdrawals, mobile-first" />
            </div>
            <div className="md:col-span-2 flex items-center justify-start md:justify-end">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 whitespace-nowrap">
                <input type="checkbox" checked={embedCaption} onChange={(e)=>setEmbedCaption(e.target.checked)} className="accent-emerald-500" />
                Embed caption
              </label>
            </div>
            <div className="md:col-span-12 flex justify-end pt-1">
              <button onClick={generateIdeogramPromptFromCopy} disabled={doctorBusy || (!doctorTitle.trim() && !doctorDescription.trim())} className="text-[11px] px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50" title="Make an image prompt from your copy">
                {doctorBusy?"Making…":"Make Ideogram Prompt"}
              </button>
            </div>
          </div>

          <div className="px-4 py-2 space-y-2 text-xs">
            {/* Style / Negative / Seed / References */}
            <div className="grid gap-2 md:grid-cols-12">
              {/* Brand style */}
              <div className="md:col-span-12 rounded-md border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Brand Style</h4>
                  <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" className="accent-emerald-500" checked={applyBrand} onChange={(e)=>setApplyBrand(e.target.checked)} />Apply in prompts</label>
                </div>
                {(brandOpBusy || brandProgress > 0) && (
                  <div className="mt-2">
                    <div className="h-3 w-full rounded bg-slate-800 overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(brandProgress,100)}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">{brandStep} {brandProgress > 0 && brandProgress < 100 ? `${brandProgress}%` : brandProgress===100? "100%" : ""}</div>
                  </div>
                )}
                <div className="mt-2 grid gap-2 md:grid-cols-12 text-[11px]">
                  <div className="md:col-span-8">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Brand URL (optional)</label>
                    <input value={brandUrl} onChange={(e)=>setBrandUrl(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" placeholder="https://www.sol88.mx/" />
                  </div>
                  <div className="md:col-span-4 flex items-end gap-2">
                    <button
                      type="button"
                      disabled={brandOpBusy}
                      className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
                      title="Index all public pages for this brand"
                      onClick={async()=>{
                        const u = brandUrl.trim();
                        if(!u){ showBrandToast("Please enter a Brand URL first.", "error"); return; }
                        setBrandOpBusy(true);
                        setBrandProgress(10);
                        setBrandStep("Starting crawl…");
                        // start SSE stream
                        startBrandStream(u);
                        showBrandToast("Indexing brand…", "info");
                        try {
                          const r1 = await fetch("/api/brand/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: u, maxPages: 500 }) });
                          if (!r1.ok) {
                            const txt = await r1.text().catch(()=>"");
                            showBrandToast(`Index failed (${r1.status}). ${txt || ""}`.trim(), "error");
                            setBrandStep("Crawl failed");
                            return;
                          }
                          if (!hasOpenAI) {
                            showBrandToast("Index complete. Set OPENAI_API_KEY to generate style.", "info");
                            setBrandProgress(100);
                            setBrandStep("Crawl complete");
                            await stopBrandStream(u);
                          } else {
                            showBrandToast("Index complete. Generating style…", "info");
                            setBrandProgress(60);
                            setBrandStep("Generating style…");
                            const r2 = await fetch("/api/brand/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: u }) });
                            if (!r2.ok) {
                              const txt = await r2.text().catch(()=>"");
                              showBrandToast(`Style generation failed (${r2.status}). Ensure OPENAI_API_KEY is set.` + (txt? ` ${txt}`:""), "error");
                              setBrandStep("Style failed");
                              return;
                            }
                            await loadBrands();
                            setBrandProgress(100);
                            setBrandStep("Done");
                            showBrandToast("Brand style ready.", "success");
                            await stopBrandStream(u);
                          }
                        } catch (e) {
                          showBrandToast("Unexpected error during brand indexing.", "error");
                          setBrandStep("Error");
                        } finally {
                          setBrandOpBusy(false);
                          try { if (brandProgress === 100) setTimeout(()=> setBrandProgress(0), 2500); } catch {}
                        }
                      }}
                    >Index brand</button>
                    <button
                      type="button"
                      disabled={brandOpBusy || !hasOpenAI}
                      className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
                      title={hasOpenAI ? "Only generate style notes from the last crawl" : "Set OPENAI_API_KEY in Vercel to enable style generation"}
                      onClick={async()=>{
                        const u = brandUrl.trim();
                        if(!u){ showBrandToast("Please enter a Brand URL first.", "error"); return; }
                        setBrandOpBusy(true);
                        setBrandProgress(60);
                        setBrandStep("Generating style…");
                        startBrandStream(u);
                        showBrandToast("Generating style from last crawl…", "info");
                        try {
                          const r2 = await fetch("/api/brand/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: u }) });
                          if (!r2.ok) throw new Error(String(r2.status));
                          await loadBrands();
                          setBrandProgress(100);
                          setBrandStep("Done");
                          showBrandToast("Brand style ready.", "success");
                          await stopBrandStream(u);
                        } catch (e) {
                          showBrandToast("Brand style generation failed.", "error");
                          setBrandStep("Style failed");
                        } finally {
                          setBrandOpBusy(false);
                          try { if (brandProgress === 100) setTimeout(()=> setBrandProgress(0), 2500); } catch {}
                        }
                      }}
                    >Generate style</button>
                    {brandOpBusy && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <span className="inline-block h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        Working…
                      </span>
                    )}
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Select brand</label>
                    <select value={selectedBrandId} onChange={(e)=>{
                      const id = e.target.value; setSelectedBrandId(id);
                      const b = brandList.find(x=>x.id===id);
                      if(b){ setBrandName(b.name||""); setBrandColors((b.colors||[]).join(", ")); setBrandStyle(b.style||""); setBrandNegative(b.negative||""); }
                    }} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
                      {brandList.map((b)=> (<option key={b.id} value={b.id}>{b.name}</option>))}
                      {brandList.length===0 && (<option value="">No brands</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Brand name</label>
                    <input value={brandName} onChange={(e)=>setBrandName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" placeholder="Your brand" />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Colors (comma-separated)</label>
                    <input value={brandColors} onChange={(e)=>setBrandColors(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" placeholder="#00ff88, #0a0f1a" />
                    {colorList.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {colorList.map((c, i) => (
                          <div key={`${c}-${i}`} className="flex items-center gap-1">
                            <span
                              className="inline-block w-4 h-4 rounded-sm border border-slate-700"
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                            <span className="text-[10px] text-slate-400">{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Negative (avoid)</label>
                    <input value={brandNegative} onChange={(e)=>setBrandNegative(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" placeholder="kiddie style, pastel, watermark" />
                  </div>
                  <div className="md:col-span-12">
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Style notes</label>
                    <textarea value={brandStyle} onChange={(e)=>setBrandStyle(e.target.value)} rows={6} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" placeholder="High-contrast, glossy casino UI, neon accents, realistic chips & cards, cinematic lighting." />
                  </div>
                  <div className="md:col-span-12 flex justify-end">
                    <button onClick={saveBrand} className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Save brand</button>
                  </div>
                </div>
              </div>
              {/* Brand-aligned Ideogram prompt suggestions */}
              {Array.isArray((ideogramSuggestions as any)) && (ideogramSuggestions as any).length > 0 && (
                <div className="md:col-span-12 rounded-md border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Brand Prompt Suggestions</h4>
                    <span className="text-[10px] text-slate-500">{(ideogramSuggestions as any).length} options</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {(ideogramSuggestions as any).slice(0,6).map((p:any, idx:number)=>{
                      const size = (p?.width && p?.height) ? `${p.width}x${p.height}` : mainImageSize;
                      return (
                        <div key={idx} className="rounded border border-slate-800 bg-slate-950 p-2 flex flex-col gap-2">
                          <div className="text-[11px] text-slate-300 font-medium truncate" title={p?.title || "Prompt"}>{p?.title || `Suggestion ${idx+1}`}</div>
                          <div className="text-[11px] text-slate-400 line-clamp-4 whitespace-pre-wrap" title={p?.prompt}>{p?.prompt}</div>
                          <div className="text-[10px] text-slate-500">{p?.style_preset ? `Style: ${p.style_preset}` : "Style: AUTO"} · {size}</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800"
                              onClick={()=>{
                                setImagePrompt(String(p?.prompt||""));
                                if (p?.style_preset) setStylePreset(String(p.style_preset));
                                if (p?.negative_prompt) setNegativePrompt(String(p.negative_prompt));
                              }}
                            >Use</button>
                            <button
                              className="text-[11px] px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500"
                              onClick={async()=>{
                                // Apply prompt and brand params, then call the generator pipeline
                                setImagePrompt(String(p?.prompt||""));
                                if (p?.style_preset) setStylePreset(String(p.style_preset));
                                if (p?.negative_prompt) setNegativePrompt(String(p.negative_prompt));
                                setImageProvider("ideogram");
                                try { await generateCreativeBundle(); } catch {}
                              }}
                            >Generate</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="md:col-span-3">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Style preset</label>
                <select value={stylePreset} onChange={(e)=>setStylePreset(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs">
                  <option value="">(None)</option>
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
              <div className="md:col-span-3">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Seed</label>
                <input value={seed} onChange={(e)=>setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="(optional)" className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs" />
              </div>
              <div className="md:col-span-6">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Negative prompt</label>
                <input value={negativePrompt} onChange={(e)=>setNegativePrompt(e.target.value)} placeholder="Eg. no text overlays, no watermarks" className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs" />
              </div>
              <div className="md:col-span-6">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Character references (images)</label>
                <div className="flex items-center gap-2">
                  <input type="file" multiple accept="image/*" onChange={(e)=>{ const files = Array.from(e.target.files || []); setCharRefFiles(files as File[]); }} className="block w-full text-[11px]" />
                  <button type="button" onClick={()=>setShowPicker({ open: true, mode: 'chars' })} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Pick…</button>
                </div>
              </div>
              <div className="md:col-span-6">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Image reference (remix)</label>
                <div className="flex items-center gap-2">
                  <input type="file" accept="image/*" onChange={(e)=>{ const f = (e.target.files && e.target.files[0]) || null; setImageRefFile(f as any); }} className="block w-full text-[11px]" />
                  <button type="button" onClick={()=>setShowPicker({ open: true, mode: 'image' })} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Pick…</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Small toast */}
      {brandToast && (
        <div className={`fixed bottom-4 right-4 z-50 px-3 py-2 rounded-md text-[11px] shadow-lg border ${brandToast.kind === 'success' ? 'bg-emerald-900/80 text-emerald-100 border-emerald-700' : brandToast.kind === 'error' ? 'bg-rose-900/80 text-rose-100 border-rose-700' : 'bg-slate-900/80 text-slate-100 border-slate-700'}`}>
          {brandToast.msg}
        </div>
      )}

      {/* Creative generator */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Creative Generator
            </h3>
            <p className="text-[11px] text-slate-400">
              Generate copy + visuals tailored to each Propeller ad type.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <div>
              Ad type:{" "}
              <select
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                value={adType}
                onChange={(e) => setAdType(e.target.value)}
              >
                {Object.entries(AD_TYPES).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              Image provider:{" "}
              <select
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                value={imageProvider}
                onChange={(e) => setImageProvider(e.target.value)}
              >
                <option value="ideogram">Ideogram</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-500" checked={saveToGallery} onChange={(e)=>setSaveToGallery(e.target.checked)} />
              Save to Gallery
            </label>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Required: {(AD_TYPES[adType]?.required || []).join(", ")}.{" "}
          <span className="text-slate-500">{AD_TYPES[adType]?.notes}</span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] text-slate-300 font-semibold">
              Brief / angle
            </label>
            <textarea
              rows={6}
              className="w-full resize-none bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Eg. High-converting casino push banner, bold CTA, mobile-first..."
            />
              <small className="text-[11px] text-slate-500">
                We'll craft the title, description, and the main image prompt
                so you can run both copy and visuals.
              </small>
          </div>

          <div className="grid gap-2 text-[11px]">
            <div className="grid gap-1">
              <div className="text-slate-400 uppercase tracking-wide text-[10px]">
                Title
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 min-h-[38px]">
                {assetTitle || "-"}
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-slate-400 uppercase tracking-wide text-[10px]">
                Description
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 min-h-[38px]">
                {assetDescription || "-"}
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-slate-400 uppercase tracking-wide text-[10px]">
                Main image prompt ({mainImageSize || "1024x1024"})
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 min-h-[38px]">
                {mainImagePrompt || "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={generateCreativeBundle}
            disabled={
              assetsLoading || imageLoading || !imagePrompt.trim()
            }
            className="text-xs px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assetsLoading || imageLoading
              ? "Generating assets…"
              : "Generate copy + visuals"}
          </button>
          {(assetsLoading || imageLoading) && (
            <span className="text-[11px] text-slate-400">
              Building copy + images...
            </span>
          )}
        </div>

        {(assetsError || imageError) && (
          <p className="text-[11px] text-rose-400 whitespace-pre-wrap">
            {assetsError || imageError}
          </p>
        )}

        {imageUrl && (
          <div>
            <div className="text-[11px] text-slate-400 mb-1">
              Main image preview (click-save):
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Generated creative"
              className="max-h-64 rounded-lg border border-slate-800 object-contain w-full"
            />
          </div>
        )}
      </div>

      {showPicker.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setShowPicker({ open:false, mode: showPicker.mode })} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-xl p-4 w-[860px] max-w-[95vw] shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200">Pick from Media Library</h4>
              <button onClick={()=>setShowPicker({ open:false, mode: showPicker.mode })} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Close</button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-12 text-[11px]">
              <div className="md:col-span-4">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Filter brand</label>
                <input value={pickerBrand} onChange={(e)=>setPickerBrand(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" />
              </div>
              <div className="md:col-span-4">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Filter tag</label>
                <input value={pickerTag} onChange={(e)=>setPickerTag(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {pickerItems.filter((it)=>{
                const okB = !pickerBrand || String(it.brandName||"").toLowerCase().includes(pickerBrand.toLowerCase());
                const okT = !pickerTag || (Array.isArray(it.tags) && it.tags.some((t:string)=>t.toLowerCase().includes(pickerTag.toLowerCase())));
                const okK = showPicker.mode === 'chars' ? it.kind === 'character' : it.kind === 'layout';
                return okB && okT && okK;
              }).slice(0,30).map((it)=>(
                <button key={it.id} className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 text-left" onClick={async ()=>{
                  try { const b = await fetch(it.url).then(r=>r.blob()); const f = new File([b], it.filename || 'ref.png', { type: (b as any).type||'image/png' });
                    if (showPicker.mode === 'chars') {
                      setCharRefFiles([...(Array.isArray(charRefFiles)?charRefFiles:[]), f]);
                    } else {
                      setImageRefFile(f);
                    }
                    setShowPicker({ open:false, mode: showPicker.mode });
                  } catch {}
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt={it.filename} className="w-full aspect-video object-cover" />
                  <div className="p-2 text-[11px] text-slate-300 truncate">{it.filename}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
