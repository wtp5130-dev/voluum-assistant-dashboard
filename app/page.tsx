"use client";

import React, { useEffect, useMemo, useState } from "react";

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

type TabKey = "dashboard" | "optimizer" | "creatives";

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
const AD_TYPES: Record<
  string,
  {
    label: string;
    notes: string;
    mainImageSize: string;
    iconSize?: string | null;
    required: string[];
  }
> = {
  "push-classic": {
    label: "Propeller Push",
    notes: "Title + desc + square icon (192px+) + main image (360x240 or square).",
    mainImageSize: "1024x1024",
    iconSize: "512x512",
    required: ["title", "description", "icon", "main image"],
  },
  "inpage-push": {
    label: "In-Page Push",
    notes: "Title + desc + square icon; image can be square or 3:2.",
    mainImageSize: "1024x768",
    iconSize: "512x512",
    required: ["title", "description", "icon", "main image"],
  },
  interstitial: {
    label: "Interstitial",
    notes: "Full-screen image; optional title/description.",
    mainImageSize: "1080x1920",
    iconSize: null,
    required: ["main image", "optional copy"],
  },
  onclick: {
    label: "Onclick / Direct Click",
    notes: "Hero image aimed at CTR (1200x628).",
    mainImageSize: "1200x628",
    iconSize: null,
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
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
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

/**
 * ===========
 * Main page
 * ===========
 */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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

// Creative image generator
const [imagePrompt, setImagePrompt] = useState(
  "High-converting casino push banner, bold CTA, mobile-first, 1:1 format."
);
const [adType, setAdType] = useState<string>("push-classic");
const [assetTitle, setAssetTitle] = useState("");
const [assetDescription, setAssetDescription] = useState("");
const [mainImagePrompt, setMainImagePrompt] = useState("");
const [iconPrompt, setIconPrompt] = useState("");
const [mainImageSize, setMainImageSize] = useState("1024x1024");
const [iconSize, setIconSize] = useState("512x512");
const [imageLoading, setImageLoading] = useState(false);
const [imageError, setImageError] = useState<string | null>(null);
const [imageUrl, setImageUrl] = useState<string | null>(null);
const [iconUrl, setIconUrl] = useState<string | null>(null);
const [assetsLoading, setAssetsLoading] = useState(false);
const [assetsError, setAssetsError] = useState<string | null>(null);

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
        setLoading(true);
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
        setLoading(false);
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
      setOptimizerStatus("Preview generated. Review zones before applying.");
    } catch (err: any) {
      console.error("Optimizer preview error:", err);
      setOptimizerStatus(
        err?.message || "Failed to generate optimizer preview."
      );
    } finally {
      setOptimizerPreviewLoading(false);
    }
  };

  const runOptimizerApply = async () => {
    if (!optimizerPreviewResult) {
      setOptimizerStatus("Run preview first before applying.");
      return;
    }

    try {
      setOptimizerApplyLoading(true);
      setOptimizerStatus(null);

      const res = await fetch(OPTIMIZER_APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zonesToPauseNow: optimizerPreviewResult.zonesToPauseNow,
          dryRun: optimizerDryRun,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apply failed (${res.status}): ${text}`);
      }

      const json = await res.json();
      setOptimizerStatus(
        optimizerDryRun
          ? `Dry run completed. ${json.summary ?? "Check logs for details."}`
          : `Apply completed. ${json.summary ?? "Zones were sent to PropellerAds."}`
      );
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
  const sendCreativeChat = async () => {
    const content = creativeChatInput.trim();
    if (!content || creativeChatLoading) return;

    const newMessages: ChatMessage[] = [
      ...creativeChatMessages,
      { role: "user", content },
    ];
    setCreativeChatMessages(newMessages);
    setCreativeChatInput("");
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

  const generateImages = async (
    mainPromptText: string,
    iconPromptText?: string | null,
    mainSize?: string,
    iconSizeOverride?: string | null
  ) => {
    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);
    setIconUrl(null);

    try {
      const mainRes = await fetch(CREATIVE_IMAGE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: mainPromptText,
          size: mainSize || mainImageSize,
        }),
      });

      if (!mainRes.ok) {
        const text = await mainRes.text();
        throw new Error(`Main image failed (${mainRes.status}): ${text}`);
      }

      const mainJson = await mainRes.json();
      const mainUrl: string | undefined =
        mainJson.url ?? mainJson.imageUrl ?? mainJson.data?.[0]?.url;
      if (!mainUrl) {
        throw new Error("No main image URL returned from API.");
      }
      setImageUrl(mainUrl);

      if (iconPromptText && iconPromptText.trim()) {
        const iconRes = await fetch(CREATIVE_IMAGE_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: iconPromptText,
            size: iconSizeOverride || iconSize || "512x512",
          }),
        });

        if (!iconRes.ok) {
          const text = await iconRes.text();
          throw new Error(`Icon image failed (${iconRes.status}): ${text}`);
        }

        const iconJson = await iconRes.json();
        const iconImageUrl: string | undefined =
          iconJson.url ?? iconJson.imageUrl ?? iconJson.data?.[0]?.url;
        if (iconImageUrl) {
          setIconUrl(iconImageUrl);
        }
      }
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
    setIconUrl(null);

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
      const newIconPrompt = json.iconPrompt ?? "";
      const newMainSize =
        json.mainImageSize ?? AD_TYPES[adType]?.mainImageSize ?? "1024x1024";
      const newIconSize =
        json.iconSize ??
        (AD_TYPES[adType]?.iconSize ?? undefined) ??
        null;

      setAssetTitle(newTitle);
      setAssetDescription(newDescription);
      setMainImagePrompt(newMainPrompt);
      setIconPrompt(newIconPrompt);
      setMainImageSize(newMainSize);
      setIconSize(newIconSize || "");

      await generateImages(
        newMainPrompt,
        newIconPrompt,
        newMainSize,
        newIconSize
      );
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

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-lg font-medium">Loading Voluum data…</div>
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
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Voluum Assistant
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {data.dateRange} • {new Date(data.from).toLocaleString()} –{" "}
            {new Date(data.to).toLocaleString()}
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

      {/* Big tab buttons */}
      <div className="flex gap-2 justify-center mb-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-6 py-2 rounded-full text-sm font-semibold border ${
            activeTab === "dashboard"
              ? "bg-emerald-500 text-slate-900 border-emerald-400 shadow-lg"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("optimizer")}
          className={`px-6 py-2 rounded-full text-sm font-semibold border ${
            activeTab === "optimizer"
              ? "bg-emerald-500 text-slate-900 border-emerald-400 shadow-lg"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800"
          }`}
        >
          Optimizer
        </button>
        <button
          onClick={() => setActiveTab("creatives")}
          className={`px-6 py-2 rounded-full text-sm font-semibold border ${
            activeTab === "creatives"
              ? "bg-emerald-500 text-slate-900 border-emerald-400 shadow-lg"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800"
          }`}
        >
          Creatives Doctor
        </button>
      </div>

      {/* KPI cards (always visible) */}
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 flex flex-col gap-1"
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

      {activeTab === "optimizer" && (
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
        />
      )}

      {activeTab === "creatives" && (
        <CreativesTab
          creativeChatMessages={creativeChatMessages}
          creativeChatInput={creativeChatInput}
          creativeChatLoading={creativeChatLoading}
          setCreativeChatInput={setCreativeChatInput}
          sendCreativeChat={sendCreativeChat}
          creativeTokenCount={creativeTokenCount}
          imagePrompt={imagePrompt}
          setImagePrompt={setImagePrompt}
          adType={adType}
          setAdType={setAdType}
          assetTitle={assetTitle}
          assetDescription={assetDescription}
          mainImagePrompt={mainImagePrompt}
          iconPrompt={iconPrompt}
          mainImageSize={mainImageSize}
          iconSize={iconSize}
          imageLoading={imageLoading}
          imageError={imageError}
          assetsLoading={assetsLoading}
          assetsError={assetsError}
          imageUrl={imageUrl}
          iconUrl={iconUrl}
          generateCreativeBundle={generateCreativeBundle}
        />
      )}
    </main>
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
            Showing {filteredCampaigns.length} of {data.campaigns.length}
          </span>
        </div>

        <div className="max-h-[520px] overflow-auto text-xs">
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
                    <td className="p-2 text-right">{c.visits}</td>
                    <td className="p-2 text-right">{c.signups}</td>
                    <td className="p-2 text-right">{c.deposits}</td>
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
                    value={selectedCampaign.visits}
                  />
                  <DetailStat
                    label="Signups"
                    value={selectedCampaign.signups}
                  />
                  <DetailStat
                    label="Deposits"
                    value={selectedCampaign.deposits}
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
                  {zones.length} zones
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
                        <th className="text-right p-2">Conv</th>
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
                          <td className="p-2 text-right">{z.visits}</td>
                          <td className="p-2 text-right">
                            {z.conversions}
                          </td>
                          <td className="p-2 text-right">
                            {z.signups}
                          </td>
                          <td className="p-2 text-right">
                            {z.deposits}
                          </td>
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
                  {creatives.length} creatives
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
                        <th className="text-right p-2">Conv</th>
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
                            <td className="p-2 text-right">
                              {c.visits}
                            </td>
                            <td className="p-2 text-right">
                              {c.conversions}
                            </td>
                            <td className="p-2 text-right">
                              {c.signups}
                            </td>
                            <td className="p-2 text-right">
                              {c.deposits}
                            </td>
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
  runApply: () => void;
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
  } = props;

  const zonesToPause = previewResult?.zonesToPauseNow ?? [];

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
              onClick={runApply}
              disabled={applyLoading || !previewResult}
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
              {zonesToPause.length} zones
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
                  {zonesToPause.map((z: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2 text-[11px]">
                        {z.campaignName ?? z.campaignId}
                      </td>
                      <td className="p-2 text-[11px]">
                        {z.zoneId ?? z.zone ?? "—"}
                      </td>
                      <td className="p-2 text-right text-[11px]">
                        {z.metrics?.visits ?? z.visits ?? 0}
                      </td>
                      <td className="p-2 text-right text-[11px]">
                        {z.metrics?.signups ?? z.signups ?? 0}
                      </td>
                      <td className="p-2 text-right text-[11px]">
                        {z.metrics?.deposits ?? z.deposits ?? 0}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
  sendCreativeChat: () => void;
  creativeTokenCount: number;
  imagePrompt: string;
  setImagePrompt: (v: string) => void;
  adType: string;
  setAdType: (v: string) => void;
  assetTitle: string;
  assetDescription: string;
  mainImagePrompt: string;
  iconPrompt: string;
  mainImageSize: string;
  iconSize?: string | null;
  imageLoading: boolean;
  imageError: string | null;
  assetsLoading: boolean;
  assetsError: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  generateCreativeBundle: () => void;
}) {
  const {
    creativeChatMessages,
    creativeChatInput,
    creativeChatLoading,
    setCreativeChatInput,
    sendCreativeChat,
    creativeTokenCount,
    imagePrompt,
    setImagePrompt,
    adType,
    setAdType,
    assetTitle,
    assetDescription,
    mainImagePrompt,
    iconPrompt,
    mainImageSize,
    iconSize,
    imageLoading,
    imageError,
    assetsLoading,
    assetsError,
    imageUrl,
    iconUrl,
    generateCreativeBundle,
  } = props;

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Creative Doctor chat */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col h-[420px]">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Creative Doctor
            </h3>
            <p className="text-[11px] text-slate-400">
              Paste your angles or headlines and I’ll diagnose + improve them.
            </p>
          </div>
          <div className="text-[10px] text-slate-500">
            Tokens:{" "}
            <span className="text-slate-200 font-semibold">
              {creativeTokenCount}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-auto px-4 py-2 space-y-2 text-xs">
            {creativeChatMessages.map((m, idx) => (
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
              rows={2}
              className="flex-1 resize-none bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Eg. Telegram casino MX – I want a more aggressive push title and description…"
              value={creativeChatInput}
              onChange={(e) => setCreativeChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendCreativeChat();
                }
              }}
            />
            <button
              onClick={sendCreativeChat}
              disabled={creativeChatLoading || !creativeChatInput.trim()}
              className="text-xs px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creativeChatLoading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* Creative image generator */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Creative Image Generator
            </h3>
            <p className="text-[11px] text-slate-400">
              Turn your angles into ready-to-use banner images.
            </p>
          </div>
        </div>

        <textarea
          rows={3}
          className="w-full resize-none bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
        />

        <button
          onClick={generateCreativeBundle}
          disabled={assetsLoading || imageLoading || !imagePrompt.trim()}
          className="self-start text-xs px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {assetsLoading || imageLoading
            ? "Generating..."
            : "Generate creative bundle"}
        </button>

        {assetsError && (
          <p className="text-[11px] text-rose-400 whitespace-pre-wrap">
            {assetsError}
          </p>
        )}

        {imageError && (
          <p className="text-[11px] text-rose-400 whitespace-pre-wrap">
            {imageError}
          </p>
        )}

        {imageUrl && (
          <div className="mt-2">
            <div className="text-[11px] text-slate-400 mb-1">
              Preview (click-save to download):
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Generated creative"
              className="max-h-64 rounded-lg border border-slate-800 object-contain"
            />
          </div>
        )}
      </div>
    </section>
  );
}
