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

type TabKey = "overview" | "optimizer";

/**
 * ===========
 * Optimizer types (client view)
 * ===========
 */

type OptimizerRule = {
  name: string;
  scope?: string;
  trafficSource?: string | null;
  country?: string | null;
  condition: string;
  suggestedThresholds?: {
    minVisits?: number | null;
    minCost?: number | null;
    maxROI?: number | null;
  };
  action?: string;
  appliesTo?: string;
  rationale?: string;
};

type OptimizerZoneMetrics = {
  visits: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
  signups?: number;
  deposits?: number;
};

type OptimizerZoneToPause = {
  campaignId: string;
  campaignName?: string;
  zoneId: string;
  reason: string;
  trafficSource?: string;
  country?: string;
  metrics: OptimizerZoneMetrics;
};

type OptimizerPreviewResult = {
  rules?: OptimizerRule[];
  zonesToPauseNow?: OptimizerZoneToPause[];
  meta?: any;
};

/**
 * ===========
 * Config
 * ===========
 */

const DASHBOARD_API_URL = "/api/voluum-dashboard";
// IMPORTANT: we are using /api/chat as you said
const CHAT_API_URL = "/api/chat";

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

  // Custom date state (default to last 7 days)
  const [fromDate, setFromDate] = useState<string>(() => getDaysAgoYMD(7));
  const [toDate, setToDate] = useState<string>(() => getTodayYMD());

  const [trafficSourceFilter, setTrafficSourceFilter] =
    useState<string>("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Chat state
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
  const [optimizerPreview, setOptimizerPreview] =
    useState<OptimizerPreviewResult | null>(null);
  const [optimizerPreviewLoading, setOptimizerPreviewLoading] =
    useState<boolean>(false);
  const [optimizerPreviewError, setOptimizerPreviewError] = useState<
    string | null
  >(null);

  const [optimizerApplyLoading, setOptimizerApplyLoading] =
    useState<boolean>(false);
  const [optimizerApplyError, setOptimizerApplyError] = useState<
    string | null
  >(null);
  const [optimizerApplyResult, setOptimizerApplyResult] = useState<any | null>(
    null
  );

  /**
   * Fetch dashboard data whenever dateRange or custom dates change
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

        // Any time the dashboard re-fetches, reset optimizer preview
        setOptimizerPreview(null);
        setOptimizerApplyResult(null);
        setOptimizerApplyError(null);
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
   * Chat send
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
      // Context for backend
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
   * Optimizer: preview
   */
  const runOptimizerPreview = async () => {
    if (!data) return;
    setOptimizerPreviewLoading(true);
    setOptimizerPreviewError(null);
    setOptimizerApplyResult(null);
    setOptimizerApplyError(null);

    try {
      const res = await fetch("/api/optimizer/preview", {
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

      const json = (await res.json()) as OptimizerPreviewResult;
      setOptimizerPreview(json);
    } catch (err) {
      console.error(err);
      setOptimizerPreviewError(
        err instanceof Error ? err.message : "Unknown error during preview"
      );
    } finally {
      setOptimizerPreviewLoading(false);
    }
  };

  /**
   * Optimizer: apply (dry run or live)
   */
  const applyOptimizer = async (dryRun: boolean) => {
    if (!optimizerPreview || !optimizerPreview.zonesToPauseNow?.length) {
      setOptimizerApplyError(
        "No zonesToPauseNow from preview. Run a preview first."
      );
      return;
    }

    setOptimizerApplyLoading(true);
    setOptimizerApplyError(null);
    setOptimizerApplyResult(null);

    try {
      const res = await fetch("/api/optimizer/apply", {
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
      setOptimizerApplyResult(json);
    } catch (err) {
      console.error(err);
      setOptimizerApplyError(
        err instanceof Error ? err.message : "Unknown error during apply"
      );
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
          {loading && (
            <p className="text-[10px] text-emerald-400 mt-1">
              Refreshing data…
            </p>
          )}
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

      {/* KPI cards */}
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

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-2 border-b-2 ${
            activeTab === "overview"
              ? "border-emerald-500 text-emerald-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("optimizer")}
          className={`px-3 py-2 border-b-2 ${
            activeTab === "optimizer"
              ? "border-emerald-500 text-emerald-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Optimizer
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "overview" ? (
        <>
          {/* Main layout: Campaigns + Details + Chat */}
          <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
            {/* Left: Campaign list */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Campaigns
                </h2>
                <span className="text-xs text-slate-500">
                  Showing {filteredCampaigns.length} of{" "}
                  {data.campaigns.length}
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
                          No campaigns for this traffic source / date
                          range.
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
                                <td className="p-2 text-right">
                                  {z.visits}
                                </td>
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
                                  <td className="p-2 text-right">
                                    {c.visits}
                                  </td>
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
        </>
      ) : (
        /* Optimizer tab */
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-2">
              Optimizer – Zone Auto-Pause Brain
            </h2>
            <p className="text-slate-300 mb-2">
              This tab analyzes your current Voluum data and proposes{" "}
              <span className="text-emerald-400">deposit-aware rules</span>{" "}
              and a list of{" "}
              <span className="text-rose-400">zones to pause</span>. You
              always run a preview first, then optionally apply rules in
              dry-run or live mode.
            </p>
            <ul className="list-disc list-inside text-slate-400 space-y-1">
              <li>
                Uses current <strong>date range</strong> and{" "}
                <strong>traffic source filter</strong>.
              </li>
              <li>
                Considers <strong>signups</strong>, <strong>deposits</strong>,
                ROI, and cost.
              </li>
              <li>
                You can{" "}
                <span className="text-emerald-400">
                  dry-run before doing anything live
                </span>
                .
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={runOptimizerPreview}
              disabled={optimizerPreviewLoading || loading}
              className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerPreviewLoading ? "Analyzing…" : "Run Preview"}
            </button>

            <button
              type="button"
              onClick={() => applyOptimizer(true)}
              disabled={
                optimizerApplyLoading ||
                optimizerPreviewLoading ||
                !optimizerPreview?.zonesToPauseNow?.length
              }
              className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerApplyLoading ? "Running…" : "Apply (Dry run)"}
            </button>

            <button
              type="button"
              onClick={() => applyOptimizer(false)}
              disabled={
                optimizerApplyLoading ||
                optimizerPreviewLoading ||
                !optimizerPreview?.zonesToPauseNow?.length
              }
              className="px-3 py-1 rounded-md bg-rose-700 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizerApplyLoading ? "Running…" : "Apply (Live – pause zones)"}
            </button>

            <span className="text-[11px] text-slate-500">
              Current filter:{" "}
              <span className="text-slate-200">
                {trafficSourceFilter === "all"
                  ? "All traffic sources"
                  : trafficSourceFilter}
              </span>{" "}
              • Date:{" "}
              <span className="text-slate-200">
                {data.dateRange} ({data.from} → {data.to})
              </span>
            </span>
          </div>

          {/* Preview status */}
          {optimizerPreviewError && (
            <div className="text-xs text-rose-400">
              Preview error: {optimizerPreviewError}
            </div>
          )}

          {optimizerPreview && (
            <div className="grid gap-4 lg:grid-cols-[2fr_minmax(0,2fr)]">
              {/* Rules summary */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Suggested Rules
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {optimizerPreview.rules?.length ?? 0} rules
                  </span>
                </div>

                {optimizerPreview.rules &&
                optimizerPreview.rules.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-auto pr-1">
                    {optimizerPreview.rules.map((rule, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-800 rounded-lg px-2 py-2 bg-slate-950/60"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-semibold text-slate-200 text-[11px]">
                            {rule.name}
                          </div>
                          <div className="text-[9px] text-slate-500">
                            {rule.scope ?? "zone"}
                            {rule.trafficSource
                              ? ` • ${rule.trafficSource}`
                              : ""}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-300">
                          If <span className="text-emerald-300">
                            {rule.condition}
                          </span>
                          , then{" "}
                          <span className="text-rose-300">
                            {rule.action ?? "pause_zone"}
                          </span>
                          .
                        </div>
                        {rule.appliesTo && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            Scope: {rule.appliesTo}
                          </div>
                        )}
                        {rule.rationale && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Why: {rule.rationale}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No rules returned yet. Run a preview to generate rules.
                  </div>
                )}
              </div>

              {/* Zones to pause */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Zones to pause (preview)
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {optimizerPreview.zonesToPauseNow?.length ?? 0} zones
                  </span>
                </div>

                {optimizerPreview.zonesToPauseNow &&
                optimizerPreview.zonesToPauseNow.length > 0 ? (
                  <div className="max-h-72 overflow-auto pr-1">
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="bg-slate-900/80 sticky top-0 z-10">
                        <tr className="text-slate-400">
                          <th className="text-left p-1.5">Campaign</th>
                          <th className="text-left p-1.5">Zone</th>
                          <th className="text-right p-1.5">Visits</th>
                          <th className="text-right p-1.5">Deps</th>
                          <th className="text-right p-1.5">Rev</th>
                          <th className="text-right p-1.5">Cost</th>
                          <th className="text-right p-1.5">ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optimizerPreview.zonesToPauseNow.map((z, idx) => (
                          <tr key={`${z.campaignId}-${z.zoneId}-${idx}`}>
                            <td className="p-1.5 align-top">
                              <div className="text-slate-100 line-clamp-2">
                                {z.campaignName ?? z.campaignId}
                              </div>
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                {z.reason}
                              </div>
                            </td>
                            <td className="p-1.5 align-top text-slate-200">
                              {z.zoneId}
                            </td>
                            <td className="p-1.5 text-right">
                              {z.metrics.visits}
                            </td>
                            <td className="p-1.5 text-right">
                              {z.metrics.deposits ?? 0}
                            </td>
                            <td className="p-1.5 text-right">
                              {formatMoney(z.metrics.revenue)}
                            </td>
                            <td className="p-1.5 text-right">
                              {formatMoney(z.metrics.cost)}
                            </td>
                            <td
                              className={`p-1.5 text-right ${
                                z.metrics.roi < 0
                                  ? "text-rose-400"
                                  : z.metrics.roi > 0
                                  ? "text-emerald-400"
                                  : ""
                              }`}
                            >
                              {formatPercent(z.metrics.roi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No zones flagged yet. Run a preview to see suggested
                    pauses.
                  </div>
                )}

                {optimizerApplyError && (
                  <div className="text-[11px] text-rose-400 mt-1">
                    Apply error: {optimizerApplyError}
                  </div>
                )}

                {optimizerApplyResult && (
                  <div className="mt-2 text-[10px] text-slate-400">
                    <div className="font-semibold text-slate-200 mb-1">
                      Apply response:
                    </div>
                    <pre className="bg-slate-950/60 border border-slate-800 rounded-md p-2 overflow-x-auto">
                      {JSON.stringify(optimizerApplyResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {!optimizerPreview && !optimizerPreviewLoading && (
            <p className="text-[11px] text-slate-500">
              Tip: Start by running a{" "}
              <span className="text-emerald-400 font-medium">
                Preview
              </span>{" "}
              – no zones will be paused until you explicitly click{" "}
              <span className="text-rose-400">Apply (Live)</span>.
            </p>
          )}
        </section>
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
