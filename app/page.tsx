"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Types matching the JSON you pasted
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

// 🔁 Change this if your API route is different
const API_URL = "/api/voluum-dashboard";

/**
 * Helpers
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

/**
 * Main page
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(API_URL);
        if (!res.ok) {
          throw new Error(`Failed to fetch (${res.status})`);
        }

        const json = (await res.json()) as DashboardData;
        setData(json);

        if (json.campaigns && json.campaigns.length > 0) {
          setSelectedCampaignId(json.campaigns[0].id);
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
  }, []);

  const selectedCampaign: Campaign | null = useMemo(() => {
    if (!data || !selectedCampaignId) return null;
    return data.campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  }, [data, selectedCampaignId]);

  const zones = useMemo<Zone[]>(() => {
    if (!selectedCampaign) return [];

    const raw = selectedCampaign.zones ?? [];

    // Keep all zones that have some metrics; drop only the "blank" row
    return raw.filter((z) => {
      const hasMetrics =
        (z.visits ?? 0) > 0 ||
        (z.conversions ?? 0) > 0 ||
        (z.cost ?? 0) > 0 ||
        (z.revenue ?? 0) > 0;
      const hasId = (z.id ?? "").trim().length > 0;
      // We want to show normal zones, AND it's fine if ID is missing as long as it has metrics
      return hasMetrics || hasId;
    });
  }, [selectedCampaign]);

  const creatives = useMemo<Creative[]>(() => {
    if (!selectedCampaign) return [];

    const raw = selectedCampaign.creatives ?? [];

    // Same idea: remove only totally empty placeholder rows
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
            Check your API route (`{API_URL}`) and make sure it returns the JSON
            in the format you shared.
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
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Voluum Assistant
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {data.dateRange} • {new Date(data.from).toLocaleString()} –{" "}
            {new Date(data.to).toLocaleString()}
          </p>
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

      {/* Campaigns list + details */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Campaigns overview */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Campaigns
            </h2>
            <span className="text-xs text-slate-500">
              Total: {data.campaigns.length}
            </span>
          </div>

          <div className="max-h-[480px] overflow-auto text-xs">
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
                {data.campaigns.map((c) => {
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
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected campaign details */}
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
                  <DetailStat label="Visits" value={selectedCampaign.visits} />
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
                          <td className="p-2 text-right">{z.conversions}</td>
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
      </section>
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
