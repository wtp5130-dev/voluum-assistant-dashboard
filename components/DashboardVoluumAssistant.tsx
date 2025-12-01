"use client";

import React, { useEffect, useMemo, useState } from "react";

type Kpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
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
};

type DateRangeKey = "today" | "yesterday" | "last7days";

export default function DashboardVoluumAssistant() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [selectedDateRange, setSelectedDateRange] =
    useState<DateRangeKey>("last7days");
  const [selectedSource, setSelectedSource] = useState<string>("All sources");
  const [selectedCountry, setSelectedCountry] =
    useState<string>("All countries");

  // ------- helper: guess country from campaign name -------
  const inferCountryFromName = (name: string): string => {
    const upper = name.toUpperCase();

    const has = (pattern: string) => upper.includes(pattern);

    // Explicit country words
    if (has(" MALAYSIA") || has(" MALAYSIA -") || has(" MALAYSIA –")) {
      return "MY";
    }
    if (has(" MEXICO") || has(" MEXICO -") || has(" MEXICO –")) {
      return "MX";
    }

    // Common patterns in your names:
    // "Global - MY_InPagePush...", "Global - MX_Interstitial...",
    // "[In-Page] MY – Classic Push – ...", etc.
    if (
      has(" MY_") ||
      has(" MY ") ||
      has(" MY-") ||
      has(" MY–") ||
      has(" MY]") ||
      has(" MY –")
    ) {
      return "MY";
    }

    if (
      has(" MX_") ||
      has(" MX ") ||
      has(" MX-") ||
      has(" MX–") ||
      has(" MX]") ||
      has(" MX –")
    ) {
      return "MX";
    }

    // Generic pattern " - XX " / " XX_" where XX is any two-letter code
    const m = upper.match(/[\s\-–]([A-Z]{2})[_\s\-–]/);
    if (m && m[1]) {
      return m[1];
    }

    if (has(" GLOBAL")) return "GLOBAL";

    return "Unknown";
  };

  // ------- FETCH DATA WHEN DATE RANGE CHANGES -------
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/voluum-dashboard?dateRange=${selectedDateRange}`
        );
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || json.message || "Failed to load data");
        }

        setKpis(json.kpis || []);
        setCampaigns(json.campaigns || []);
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Unknown error");
        setInsights([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedDateRange]);

  // ------- DERIVED DATA: SOURCES + COUNTRIES + FILTERED CAMPAIGNS -------
  const trafficSources = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      if (c.trafficSource) set.add(c.trafficSource);
    });
    const list = Array.from(set).sort();
    return ["All sources", ...list];
  }, [campaigns]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      const country = inferCountryFromName(c.name);
      set.add(country);
    });
    const list = Array.from(set).sort();
    return ["All countries", ...list];
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchSource =
        selectedSource === "All sources" ||
        c.trafficSource === selectedSource;

      const country = inferCountryFromName(c.name);
      const matchCountry =
        selectedCountry === "All countries" || country === selectedCountry;

      return matchSource && matchCountry;
    });
  }, [campaigns, selectedSource, selectedCountry]);

  // ------- INSIGHTS: BEST, WORST, LOSERS TO CUT -------
  useEffect(() => {
    const list: string[] = [];

    if (!filteredCampaigns.length) {
      list.push(
        "No campaign data for this date range, traffic source, and country selection."
      );
      setInsights(list);
      return;
    }

    const profitable = filteredCampaigns.filter((c) => c.profit > 0);
    const losing = filteredCampaigns.filter((c) => c.profit < 0);

    if (profitable.length > 0) {
      const best = [...profitable].sort((a, b) => b.roi - a.roi)[0];
      list.push(
        `Best campaign (ROI) in this view: ${best.name} (${best.roi.toFixed(
          1
        )}% ROI, profit $${best.profit.toFixed(2)}).`
      );
    }

    if (losing.length > 0) {
      const worst = [...losing].sort((a, b) => a.roi - b.roi)[0];
      list.push(
        `Worst campaign (ROI) in this view: ${worst.name} (${worst.roi.toFixed(
          1
        )}% ROI, loss $${Math.abs(worst.profit).toFixed(2)}).`
      );
    }

    // "Losers to review": high traffic, zero signups, losing money
    const losersToCut = filteredCampaigns.filter(
      (c) => c.visits >= 5000 && c.signups === 0 && c.profit < 0
    );

    if (losersToCut.length > 0) {
      const names = losersToCut
        .slice(0, 5)
        .map((c) => c.name)
        .join("; ");
      list.push(
        `Losers to review (>= 5000 visits, 0 signups, losing money): ${names}.`
      );
    }

    if (losing.length === 0 && profitable.length === 0) {
      list.push(
        "No conversions / revenue yet in this period – all campaigns are at zero."
      );
    }

    setInsights(list);
  }, [filteredCampaigns, selectedDateRange, selectedSource, selectedCountry]);

  const labelForRange: Record<DateRangeKey, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last7days: "Last 7 days",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Voluum Assistant Dashboard</h1>
          <p className="text-xs text-slate-400">
            Live data from your Voluum account, grouped by campaign.
          </p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full border border-slate-700">
          Status: Live
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 flex flex-col gap-4 lg:flex-row">
        {/* Left side: filters + KPIs + table */}
        <section className="flex-1 flex flex-col gap-4">
          {/* Filters + loading / error */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Date range buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">Date range:</span>
              <div className="flex gap-1">
                {(
                  [
                    "today",
                    "yesterday",
                    "last7days",
                  ] as DateRangeKey[]
                ).map((key) => {
                  const isActive = selectedDateRange === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDateRange(key)}
                      className={`text-[11px] px-3 py-1.5 rounded-full border transition ${
                        isActive
                          ? "bg-sky-500 text-slate-950 border-sky-400"
                          : "bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500"
                      }`}
                    >
                      {labelForRange[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Traffic source select */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                Traffic source:
              </span>
              <select
                className="bg-slate-900 border border-slate-700 text-[11px] rounded-full px-3 py-1.5"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
              >
                {trafficSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            {/* Country select */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Country:</span>
              <select
                className="bg-slate-900 border border-slate-700 text-[11px] rounded-full px-3 py-1.5"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Status messages */}
            <div className="flex items-center gap-3 text-[11px] ml-auto">
              {loading && (
                <span className="text-slate-400">
                  Loading data from Voluum…
                </span>
              )}
              {error && <span className="text-rose-400">Error: {error}</span>}
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {kpis.map((kpi) => (
              <div
                key={kpi.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3"
              >
                <p className="text-xs text-slate-400 uppercase">{kpi.label}</p>
                <p className="text-lg font-semibold mt-1">{kpi.value}</p>
                <p
                  className={`text-[11px] mt-1 ${
                    kpi.positive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {kpi.delta}
                </p>
              </div>
            ))}
            {kpis.length === 0 && !loading && !error && (
              <div className="text-[11px] text-slate-500">
                No KPI data available for this date range.
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Campaign performance</h2>
              <span className="text-[10px] text-slate-500">
                Range: {labelForRange[selectedDateRange]} • Source:{" "}
                {selectedSource} • Country: {selectedCountry}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-2 py-2">Campaign</th>
                    <th className="text-left px-2 py-2">Country (guessed)</th>
                    <th className="text-right px-2 py-2">Visits</th>
                    <th className="text-right px-2 py-2">Signups</th>
                    <th className="text-right px-2 py-2">Deposits</th>
                    <th className="text-right px-2 py-2">CPA</th>
                    <th className="text-right px-2 py-2">CPR</th>
                    <th className="text-right px-2 py-2">Revenue</th>
                    <th className="text-right px-2 py-2">Profit</th>
                    <th className="text-right px-2 py-2">ROI%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((c) => {
                    const country = inferCountryFromName(c.name);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-slate-800/60 align-top"
                      >
                        <td className="px-2 py-2">
                          {/* full name, no truncate, allow wrapping */}
                          <div className="text-[11px] whitespace-normal">
                            {c.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {c.trafficSource}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-left text-[11px]">
                          {country}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.visits.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.signups.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.deposits.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.deposits > 0 ? `$${c.cpa.toFixed(2)}` : "–"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.signups > 0 ? `$${c.cpr.toFixed(2)}` : "–"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          ${c.revenue.toFixed(2)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right ${
                            c.profit >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {c.profit >= 0 ? "$" : "-$"}
                          {Math.abs(c.profit).toFixed(2)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right ${
                            c.roi >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {c.roi.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCampaigns.length === 0 && !loading && !error && (
                    <tr>
                      <td
                        className="px-2 py-4 text-center text-slate-500 text-[11px]"
                        colSpan={10}
                      >
                        No campaign data available for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right side: assistant panel */}
        <aside className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 h-full flex flex-col">
            <h2 className="text-sm font-semibold mb-1">Assistant insights</h2>
            <p className="text-[11px] text-slate-400 mb-3">
              Notes for{" "}
              <span className="font-semibold">
                {labelForRange[selectedDateRange]}
              </span>{" "}
              –{" "}
              <span className="font-semibold">{selectedSource}</span> –{" "}
              <span className="font-semibold">{selectedCountry}</span>.
            </p>

            <div className="flex-1 space-y-2 text-xs overflow-y-auto pr-1">
              {insights.map((text, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800/80 rounded-xl px-3 py-2"
                >
                  {text}
                </div>
              ))}
              {!insights.length && !loading && !error && (
                <div className="text-[11px] text-slate-500">
                  No insights yet – waiting for data.
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-slate-800 pt-2">
              <label className="block text-[10px] text-slate-400 mb-1">
                Ask (coming soon)
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-1.5 placeholder:text-slate-500"
                  placeholder='Later: "Which campaigns should I pause?"'
                  disabled
                />
                <button className="text-xs px-3 py-1.5 rounded-xl bg-slate-700 text-slate-50">
                  Send
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
