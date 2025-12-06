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

type ZonePauseSuggestion = {
  campaignId: string;
  campaignName?: string;
  trafficSource?: string;
  zoneId: string;
  reason: string;
  metrics: {
    visits: number;
    conversions: number;
    revenue: number;
    cost: number;
    roi: number;
    signups?: number;
    deposits?: number;
  };
};

type OptimizerPreviewResponse = {
  rules: any[];
  zonesToPauseNow: ZonePauseSuggestion[];
  meta?: any;
};

type OptimizerApplyResponse = {
  success: boolean;
  dryRun: boolean;
  totalCalls?: number;
  pausesAttempted?: number;
  pausesSucceeded?: number;
  details?: any;
};

/**
 * ===========
 * Config
 * ===========
 */

const DASHBOARD_API_URL = "/api/voluum-dashboard";
const OPTIMIZER_PREVIEW_URL = "/api/optimizer/preview";
const OPTIMIZER_APPLY_URL = "/api/optimizer/apply";

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
 * Optimizer Page
 * ===========
 */

export default function OptimizerPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<DateRangeKey>("last7days");
  const [fromDate, setFromDate] = useState<string>(() => getDaysAgoYMD(7));
  const [toDate, setToDate] = useState<string>(() => getTodayYMD());

  const [trafficSourceFilter, setTrafficSourceFilter] =
    useState<string>("all");

  // Optimizer state
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] =
    useState<OptimizerPreviewResponse | null>(null);

  const [applyLoading, setApplyLoading] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] =
    useState<OptimizerApplyResponse | null>(null);

  /**
   * Fetch dashboard data whenever dateRange or custom dates change
   * (same pattern as on the main dashboard page — no full page reload)
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
          throw new Error(`Failed to fetch dashboard (${res.status})`);
        }

        const json = (await res.json()) as DashboardData;
        setData(json);
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
   * Preview optimizer rules + suggested zones to pause
   */
  const handlePreview = async () => {
    if (!data) {
      setPreviewError("No dashboard data loaded yet.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    setApplyResult(null);
    setApplyError(null);

    try {
      const res = await fetch(OPTIMIZER_PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: data,
          trafficSourceFilter,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Preview failed (${res.status}): ${txt}`);
      }

      const json = (await res.json()) as OptimizerPreviewResponse;
      setPreviewResult(json);
    } catch (err) {
      console.error(err);
      setPreviewError(
        err instanceof Error ? err.message : "Unknown error during preview"
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * Apply optimizer rules (dryRun or live)
   */
  const handleApply = async (dryRun: boolean) => {
    if (!previewResult || !previewResult.zonesToPauseNow) {
      setApplyError("No preview data available. Run a preview first.");
      return;
    }

    if (previewResult.zonesToPauseNow.length === 0) {
      setApplyError("Preview returned no zones to pause.");
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const res = await fetch(OPTIMIZER_APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zonesToPauseNow: previewResult.zonesToPauseNow,
          dryRun,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Apply failed (${res.status}): ${txt}`);
      }

      const json = (await res.json()) as OptimizerApplyResponse;
      setApplyResult(json);
    } catch (err) {
      console.error(err);
      setApplyError(
        err instanceof Error ? err.message : "Unknown error while applying"
      );
    } finally {
      setApplyLoading(false);
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
        <div className="text-lg font-medium">
          Loading dashboard data for optimizer…
        </div>
      </main>
    );
  }

  if (error && !data) {
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

  const totalZonesSuggested =
    previewResult?.zonesToPauseNow?.length ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Header + Controls */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Optimizer – Zone Auto-Pause
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {data.dateRange} • {formatDateTimeGMT8(data.from)} – {formatDateTimeGMT8(data.to)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            This page is for previewing and applying auto-pause rules to
            zones (PropellerAds, etc.) based on Voluum data (signups,
            deposits, ROI).
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

      {/* Optimizer controls + status */}
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Run Optimizer
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Step 1: Preview rules → Step 2: Run a dry run → Step 3:
                Run live (optional).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePreview}
                disabled={previewLoading || loading}
                className="text-xs px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {previewLoading ? "Previewing…" : "Preview rules"}
              </button>
              <button
                onClick={() => handleApply(true)}
                disabled={
                  applyLoading ||
                  previewLoading ||
                  !previewResult ||
                  (previewResult?.zonesToPauseNow?.length ?? 0) === 0
                }
                className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyLoading ? "Running…" : "Dry run (no real pauses)"}
              </button>
              <button
                onClick={() => handleApply(false)}
                disabled={
                  applyLoading ||
                  previewLoading ||
                  !previewResult ||
                  (previewResult?.zonesToPauseNow?.length ?? 0) === 0
                }
                className="text-xs px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyLoading ? "Running…" : "Run live (pause zones)"}
              </button>
            </div>
          </div>

          {/* Status line */}
          <div className="text-[11px] text-slate-400">
            {previewError && (
              <div className="text-rose-400">Preview error: {previewError}</div>
            )}
            {applyError && (
              <div className="text-rose-400 mt-1">
                Apply error: {applyError}
              </div>
            )}
            {previewResult && (
              <div className="mt-1">
                Preview:{" "}
                <span className="text-emerald-400 font-medium">
                  {totalZonesSuggested} zone
                  {totalZonesSuggested === 1 ? "" : "s"}
                </span>{" "}
                suggested to pause.
              </div>
            )}
            {applyResult && (
              <div className="mt-1">
                Apply result:{" "}
                <span className="text-emerald-400 font-medium">
                  {applyResult.success
                    ? applyResult.dryRun
                      ? "Dry run OK"
                      : "Live pause OK"
                    : "Failed"}
                </span>
                {typeof applyResult.pausesSucceeded === "number" && (
                  <span className="ml-1">
                    – Paused successfully: {applyResult.pausesSucceeded}/
                    {applyResult.pausesAttempted ?? "?"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zones to pause now */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Zones to pause now (preview)
            </h3>
            <span className="text-[10px] text-slate-500">
              {totalZonesSuggested} zone
              {totalZonesSuggested === 1 ? "" : "s"}
            </span>
          </div>

          {(!previewResult ||
            !previewResult.zonesToPauseNow ||
            previewResult.zonesToPauseNow.length === 0) && (
            <div className="p-4 text-[11px] text-slate-500">
              Run a preview to see which zones the optimizer wants to
              pause.
            </div>
          )}

          {previewResult &&
            previewResult.zonesToPauseNow &&
            previewResult.zonesToPauseNow.length > 0 && (
              <div className="max-h-80 overflow-auto text-[11px]">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-900/80 sticky top-0 z-10">
                    <tr className="text-slate-400">
                      <th className="text-left p-2">Campaign</th>
                      <th className="text-left p-2">Traffic source</th>
                      <th className="text-left p-2">Zone ID</th>
                      <th className="text-right p-2">Visits</th>
                      <th className="text-right p-2">Conv</th>
                      <th className="text-right p-2">Signups</th>
                      <th className="text-right p-2">Deps</th>
                      <th className="text-right p-2">Rev</th>
                      <th className="text-right p-2">Cost</th>
                      <th className="text-right p-2">ROI</th>
                      <th className="text-left p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.zonesToPauseNow.map((z, idx) => (
                      <tr key={`${z.campaignId}-${z.zoneId}-${idx}`}>
                        <td className="p-2">
                          {z.campaignName ?? z.campaignId}
                        </td>
                        <td className="p-2">
                          {z.trafficSource ?? "—"}
                        </td>
                        <td className="p-2">{z.zoneId}</td>
                        <td className="p-2 text-right">
                          {z.metrics.visits}
                        </td>
                        <td className="p-2 text-right">
                          {z.metrics.conversions}
                        </td>
                        <td className="p-2 text-right">
                          {z.metrics.signups ?? "—"}
                        </td>
                        <td className="p-2 text-right">
                          {z.metrics.deposits ?? "—"}
                        </td>
                        <td className="p-2 text-right">
                          {formatMoney(z.metrics.revenue)}
                        </td>
                        <td className="p-2 text-right">
                          {formatMoney(z.metrics.cost)}
                        </td>
                        <td
                          className={`p-2 text-right ${
                            z.metrics.roi < 0
                              ? "text-rose-400"
                              : z.metrics.roi > 0
                              ? "text-emerald-400"
                              : ""
                          }`}
                        >
                          {formatPercent(z.metrics.roi)}
                        </td>
                        <td className="p-2 max-w-xs">
                          <span className="block text-[11px] text-slate-300">
                            {z.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        {/* Raw rules JSON */}
        {previewResult && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">
              Rules JSON (for debugging / backup)
            </h3>
            <pre className="text-[11px] bg-slate-950/70 border border-slate-800 rounded-md p-3 overflow-auto max-h-80">
              {JSON.stringify(
                {
                  rules: previewResult.rules ?? [],
                  zonesToPauseNow: previewResult.zonesToPauseNow ?? [],
                  meta: previewResult.meta ?? {},
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}
