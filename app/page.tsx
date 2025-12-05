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
  revenue: number;
  cost: number;
  roi: number;
};

type Creative = {
  id: string;
  name?: string | null;
  visits: number;
  conversions: number;
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
const CREATIVE_DOCTOR_URL = "/api/creative-doctor";
const CREATIVE_IMAGES_URL = "/api/creative-images";

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

  // Chat state (Dashboard tab assistant)
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
  const [optimizerApplyLoading, setOptimizerApplyLoading] =
    useState(false);
  const [optimizerPreview, setOptimizerPreview] = useState<any | null>(
    null
  );
  const [optimizerError, setOptimizerError] = useState<string | null>(
    null
  );

  // Creative Doctor state
  const [cdQuestion, setCdQuestion] = useState<string>(
    "What are my top creatives and what new angles should I test next?"
  );
  const [cdLoading, setCdLoading] = useState<boolean>(false);
  const [cdAnswer, setCdAnswer] = useState<string | null>(null);
  const [cdError, setCdError] = useState<string | null>(null);

  // Creative image generator state
  const [imagePrompt, setImagePrompt] = useState<string>(
    "High-converting casino push banner, bold CTA, mobile-first, 1:1 format."
  );
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  /**
   * Fetch dashboard data whenever dateRange or custom dates change
   * (pure client-side, no full-page refresh)
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
        (c.cost ?? 0) > 0 ||
        (c.revenue ?? 0) > 0;
      const hasIdOrName =
        (c.id ?? "").trim().length > 0 ||
        (c.name ?? "").toString().trim().length > 0;

      return hasMetrics || hasIdOrName;
    });
  }, [selectedCampaign]);

  /**
   * DASHBOARD TAB - Chat send
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
   * OPTIMIZER TAB - Preview
   */
  const runOptimizerPreview = async () => {
    if (!data) return;
    try {
      setOptimizerError(null);
      setOptimizerPreviewLoading(true);

      const res = await fetch(OPTIMIZER_PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: data,
          trafficSourceFilter,
        }),
      });

      if (!res.ok) {
        throw new Error(`Preview failed (${res.status})`);
      }

      const json = await res.json();
      setOptimizerPreview(json);
    } catch (err) {
      console.error(err);
      setOptimizerError(
        err instanceof Error ? err.message : "Unknown preview error"
      );
    } finally {
      setOptimizerPreviewLoading(false);
    }
  };

  /**
   * OPTIMIZER TAB - Apply
   */
  const runOptimizerApply = async (dryRun: boolean) => {
    if (!optimizerPreview || !optimizerPreview.zonesToPauseNow) {
      setOptimizerError("Run preview first – no zonesToPauseNow found.");
      return;
    }

    try {
      setOptimizerError(null);
      setOptimizerApplyLoading(true);

      const res = await fetch(OPTIMIZER_APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zonesToPauseNow: optimizerPreview.zonesToPauseNow,
          dryRun,
        }),
      });

      if (!res.ok) {
        throw new Error(`Apply failed (${res.status})`);
      }

      const json = await res.json();
      console.log("Optimizer apply result:", json);
      setOptimizerPreview((prev: any) =>
        prev ? { ...prev, applyResult: json } : prev
      );
    } catch (err) {
      console.error(err);
      setOptimizerError(
        err instanceof Error ? err.message : "Unknown apply error"
      );
    } finally {
      setOptimizerApplyLoading(false);
    }
  };

  /**
   * CREATIVE DOCTOR TAB - Ask /api/creative-doctor with streaming
   */
  const askCreativeDoctor = async () => {
    if (!data || !selectedCampaign) {
      setCdError("No campaign selected or no data loaded.");
      return;
    }

    const question = cdQuestion.trim();
    if (!question) {
      setCdError("Ask a question about your creatives.");
      return;
    }

    try {
      setCdError(null);
      setCdLoading(true);
      setCdAnswer(""); // start empty so we can stream into it

      const payload = {
        question,
        campaign: selectedCampaign,
        creatives,
        dateRange: data.dateRange,
        from: data.from,
        to: data.to,
      };

      const res = await fetch(CREATIVE_DOCTOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Creative Doctor failed (${res.status})`);
      }

      if (!res.body) {
        throw new Error("No response body from Creative Doctor");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      // Read chunks and update UI live
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setCdAnswer(fullText);
      }
    } catch (err) {
      console.error(err);
      setCdError(
        err instanceof Error ? err.message : "Unknown creative doctor error"
      );
      if (!cdAnswer) {
        setCdAnswer(
          "[Creative Doctor could not complete the response due to an error.]"
        );
      }
    } finally {
      setCdLoading(false);
    }
  };

  /**
   * CREATIVE DOCTOR TAB - Generate image via /api/creative-images
   */
  const generateCreativeImage = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt) {
      setImageError("Describe the image / angle you want.");
      return;
    }

    try {
      setImageError(null);
      setImageLoading(true);
      setImageUrl(null);

      const res = await fetch(CREATIVE_IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size: "1024x1024",
        }),
      });

      if (!res.ok) {
        throw new Error(`Image generation failed (${res.status})`);
      }

      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) {
        throw new Error(json.error || "No image URL returned");
      }

      setImageUrl(json.url);
    } catch (err) {
      console.error(err);
      setImageError(
        err instanceof Error ? err.message : "Unknown image generation error"
      );
    } finally {
      setImageLoading(false);
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
      {/* Header + Controls */}
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

      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl border border-emerald-600 bg-slate-900/70 p-1 shadow-lg shadow-emerald-900/40">
          <TabButton
            label="Dashboard"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <TabButton
            label="Optimizer"
            active={activeTab === "optimizer"}
            onClick={() => setActiveTab("optimizer")}
          />
          <TabButton
            label="Creatives Doctor"
            active={activeTab === "creatives"}
            onClick={() => setActiveTab("creatives")}
          />
        </div>
      </div>

      {/* KPI cards (shared) */}
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

      {/* TAB CONTENTS */}
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
          optimizerPreview={optimizerPreview}
          optimizerPreviewLoading={optimizerPreviewLoading}
          optimizerApplyLoading={optimizerApplyLoading}
          optimizerError={optimizerError}
          runPreview={runOptimizerPreview}
          runApply={runOptimizerApply}
        />
      )}

      {activeTab === "creatives" && (
        <CreativesDoctorTab
          selectedCampaign={selectedCampaign}
          creatives={creatives}
          cdQuestion={cdQuestion}
          setCdQuestion={setCdQuestion}
          cdLoading={cdLoading}
          cdAnswer={cdAnswer}
          cdError={cdError}
          askCreativeDoctor={askCreativeDoctor}
          imagePrompt={imagePrompt}
          setImagePrompt={setImagePrompt}
          imageLoading={imageLoading}
          imageUrl={imageUrl}
          imageError={imageError}
          generateCreativeImage={generateCreativeImage}
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
 * Tab button
 */
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 ${
        active
          ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-800"
          : "bg-transparent text-slate-300 hover:bg-slate-800/60"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * DASHBOARD TAB COMPONENT
 */
function DashboardTab({
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
}: {
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
  setChatInput: (value: string) => void;
  sendChat: () => void;
}) {
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
        {/* Campaign details + breakdowns */}
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
                            <td className="p-2 text-right">{c.visits}</td>
                            <td className="p-2 text-right">
                              {c.conversions}
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
 * OPTIMIZER TAB COMPONENT
 */
function OptimizerTab({
  data,
  trafficSourceFilter,
  optimizerPreview,
  optimizerPreviewLoading,
  optimizerApplyLoading,
  optimizerError,
  runPreview,
  runApply,
}: {
  data: DashboardData;
  trafficSourceFilter: string;
  optimizerPreview: any | null;
  optimizerPreviewLoading: boolean;
  optimizerApplyLoading: boolean;
  optimizerError: string | null;
  runPreview: () => void;
  runApply: (dryRun: boolean) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              PropellerAds Optimizer
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Auto-pause bad zones based on deposits, ROI, and burn patterns.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Current traffic source filter:{" "}
              <span className="font-semibold text-emerald-400">
                {trafficSourceFilter === "all"
                  ? "All traffic sources"
                  : trafficSourceFilter}
              </span>
              .
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={runPreview}
              disabled={optimizerPreviewLoading}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerPreviewLoading ? "Running preview…" : "1) Preview rules"}
            </button>
            <button
              onClick={() => runApply(true)}
              disabled={optimizerApplyLoading}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerApplyLoading ? "Applying…" : "2) Dry run (no pause)"}
            </button>
            <button
              onClick={() => runApply(false)}
              disabled={optimizerApplyLoading}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerApplyLoading ? "Applying…" : "3) Live apply (pause zones)"}
            </button>
          </div>
        </div>

        {optimizerError && (
          <div className="text-xs text-rose-400">{optimizerError}</div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">
            Rules preview
          </h3>
          {!optimizerPreview?.rules?.length ? (
            <p className="text-slate-500">
              Run a preview to see suggested automation rules.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {optimizerPreview.rules.map((rule: any, idx: number) => (
                <div
                  key={idx}
                  className="border border-slate-700 rounded-lg p-2 bg-slate-900/80"
                >
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1">
                    {rule.name}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <span className="font-semibold">Condition:</span>{" "}
                    {rule.condition}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    <span className="font-semibold">Action:</span>{" "}
                    {rule.action}
                  </div>
                  {rule.rationale && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      {rule.rationale}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">
            Zones to pause (preview)
          </h3>
          {!optimizerPreview?.zonesToPauseNow?.length ? (
            <p className="text-slate-500">
              After preview, any zones that match the rules will show here
              with metrics and reasons.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {optimizerPreview.zonesToPauseNow.map(
                (z: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-slate-700 rounded-lg p-2 bg-slate-900/80"
                  >
                    <div className="text-[11px] font-semibold text-rose-400 mb-1">
                      Campaign: {z.campaignId} • Zone: {z.zoneId}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {z.reason}
                    </div>
                    {z.metrics && (
                      <div className="text-[11px] text-slate-400 mt-1 space-x-2">
                        <span>Visits: {z.metrics.visits}</span>
                        <span>Conv: {z.metrics.conversions}</span>
                        <span>Rev: {formatMoney(z.metrics.revenue)}</span>
                        <span>Cost: {formatMoney(z.metrics.cost)}</span>
                        <span>ROI: {formatPercent(z.metrics.roi)}</span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * CREATIVES DOCTOR TAB COMPONENT
 */
function CreativesDoctorTab({
  selectedCampaign,
  creatives,
  cdQuestion,
  setCdQuestion,
  cdLoading,
  cdAnswer,
  cdError,
  askCreativeDoctor,
  imagePrompt,
  setImagePrompt,
  imageLoading,
  imageUrl,
  imageError,
  generateCreativeImage,
}: {
  selectedCampaign: Campaign | null;
  creatives: Creative[];
  cdQuestion: string;
  setCdQuestion: (value: string) => void;
  cdLoading: boolean;
  cdAnswer: string | null;
  cdError: string | null;
  askCreativeDoctor: () => void;
  imagePrompt: string;
  setImagePrompt: (value: string) => void;
  imageLoading: boolean;
  imageUrl: string | null;
  imageError: string | null;
  generateCreativeImage: () => void;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
      {/* Left: Creatives table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Creatives
            </h2>
            <p className="text-[11px] text-slate-400">
              {selectedCampaign
                ? selectedCampaign.name
                : "Select a campaign on the Dashboard tab."}
            </p>
          </div>
          <span className="text-[10px] text-slate-500">
            {creatives.length} creatives
          </span>
        </div>

        {creatives.length === 0 ? (
          <div className="p-4 text-[11px] text-slate-500">
            No creatives found for the selected campaign / date range.
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto text-[11px]">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr className="text-slate-400">
                  <th className="text-left p-2">Creative</th>
                  <th className="text-right p-2">Visits</th>
                  <th className="text-right p-2">Conv</th>
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
                      <td className="p-2 text-right">{c.visits}</td>
                      <td className="p-2 text-right">
                        {c.conversions}
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

      {/* Right: Creative Doctor + Image generator */}
      <div className="flex flex-col gap-4">
        {/* Creative Doctor */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Creative Doctor
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Ask about winners, angles, fatigue, and new tests.
              </p>
            </div>
            {cdLoading && (
              <span className="text-[10px] text-emerald-400 animate-pulse">
                Thinking live…
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              className="w-full min-h-[60px] bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={cdQuestion}
              onChange={(e) => setCdQuestion(e.target.value)}
            />
            <div className="flex justify-between items-center gap-2">
              <button
                onClick={askCreativeDoctor}
                disabled={cdLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cdLoading ? "Streaming answer…" : "Ask Creative Doctor"}
              </button>
              {cdError && (
                <span className="text-[11px] text-rose-400">{cdError}</span>
              )}
            </div>
          </div>

          <div className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950/70 border border-slate-800 px-3 py-2">
            {cdAnswer ? (
              <div className="whitespace-pre-wrap text-[11px] text-slate-100">
                {cdAnswer}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                The doctor will summarize your best creatives, weak ones,
                and suggest new ideas once you ask a question.  
                When it’s running you’ll see the answer stream live here.
              </div>
            )}
          </div>
        </div>

        {/* Image Generator */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Creative Image Generator
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Turn your angles into ready-to-use banner images.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              className="w-full min-h-[60px] bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image: offer angle, colors, text, style, format (e.g. 1:1 push banner)."
            />
            <div className="flex justify-between items-center gap-2">
              <button
                onClick={generateCreativeImage}
                disabled={imageLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageLoading ? "Generating…" : "Generate image"}
              </button>
              {imageError && (
                <span className="text-[11px] text-rose-400">{imageError}</span>
              )}
            </div>
          </div>

          <div className="mt-2 flex justify-center">
            {imageUrl ? (
              <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-950 p-2">
                <img
                  src={imageUrl}
                  alt="Generated creative"
                  className="max-h-64 max-w-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 text-center w-full border border-dashed border-slate-700 rounded-lg py-6">
                Generated images will appear here as a live preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
