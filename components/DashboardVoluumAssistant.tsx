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
  zones: {
    id: string;
    visits: number;
    conversions: number;
    revenue: number;
    cost: number;
    roi: number;
  }[];
  creatives: {
    id: string;
    name?: string | null;
    visits: number;
    conversions: number;
    revenue: number;
    cost: number;
    roi: number;
  }[];
};

type DateRangeKey = "today" | "yesterday" | "last7days" | "last30days";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
};

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

  // Chat state
  const [chatInput, setChatInput] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Expanded campaign rows (for zones + creatives)
  const [expandedCampaigns, setExpandedCampaigns] = useState<
    Record<string, boolean>
  >({});

  const toggleCampaignExpanded = (id: string) => {
    setExpandedCampaigns((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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

    // patterns like MY_, MY – , etc
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

    // generic pattern for any 2-letter code
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

        // normalize campaigns to ensure all numeric fields exist
        const normalizedCampaigns: Campaign[] = (json.campaigns || []).map(
          (c: any) => ({
            id:
              c.id ??
              c.campaignId ??
              c.campaignName ??
              String(c.name ?? "unknown"),
            name: c.name ?? c.campaignName ?? "Unknown campaign",
            trafficSource: c.trafficSource ?? c.trafficSourceName ?? "Unknown",
            visits: Number(c.visits ?? 0),
            conversions: Number(c.conversions ?? 0),
            signups: Number(c.signups ?? c.customConversions1 ?? 0),
            deposits: Number(c.deposits ?? c.customConversions2 ?? 0),
            revenue: Number(c.revenue ?? 0),
            profit: Number(c.profit ?? 0),
            roi: Number(c.roi ?? 0),
            cost: Number(c.cost ?? 0),
            cpa: (() => {
              const cost = Number(c.cost ?? 0);
              const deposits = Number(c.deposits ?? c.customConversions2 ?? 0);
              return deposits > 0 ? cost / deposits : 0;
            })(),
            cpr: (() => {
              const cost = Number(c.cost ?? 0);
              const signups = Number(c.signups ?? c.customConversions1 ?? 0);
              return signups > 0 ? cost / signups : 0;
            })(),
            zones: (c.zones || []).map((z: any) => ({
              id: String(z.id ?? ""),
              visits: Number(z.visits ?? 0),
              conversions: Number(z.conversions ?? 0),
              revenue: Number(z.revenue ?? 0),
              cost: Number(z.cost ?? 0),
              roi: Number(z.roi ?? 0),
            })),
            creatives: (c.creatives || []).map((cr: any) => ({
              id: String(cr.id ?? ""),
              name: cr.name ?? null,
              visits: Number(cr.visits ?? 0),
              conversions: Number(cr.conversions ?? 0),
              revenue: Number(cr.revenue ?? 0),
              cost: Number(cr.cost ?? 0),
              roi: Number(cr.roi ?? 0),
            })),
          })
        );

        setCampaigns(normalizedCampaigns);
        // reset expanded state when campaigns change
        setExpandedCampaigns({});
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

  // ------- INSIGHTS: BEST, WORST, LOSERS TO CUT (local, simple) -------
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
    last30days: "Last 30 days",
  };

  // ------- CHAT: send question to /api/assistant -------
  const handleSendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const newUserMessage: ChatMessage = {
      role: "user",
      content: trimmed,
    };

    setChatMessages((prev) => [...prev, newUserMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmed,
          kpis,
          campaigns: filteredCampaigns,
          dateRange: selectedDateRange,
          trafficSource: selectedSource,
          country: selectedCountry,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || json.message || "Assistant error");
      }

      const answer: string =
        json.answer ||
        json.message ||
        "No answer text returned from assistant.";

      const usage = json.usage || null;

      const aiMessage: ChatMessage = {
        role: "assistant",
        content: answer,
        usage,
      };

      setChatMessages((prev) => [...prev, aiMessage]);
    } catch (e: any) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content:
          "Sorry, I couldn't generate an answer: " +
          (e?.message || String(e)),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    e
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendChat();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">PropellarAds Sidekick Dashboard</h1>
          <p className="text-xs text-slate-400">
            Live data from your Voluum account, grouped by campaign.
          </p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full border border-slate-700">
          Status: Live
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Left side: filters + KPIs + table */}
        <section className="flex-1 flex flex-col gap-4">
          {/* Filters + loading / error */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Date range buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">Date range:</span>
              <div className="flex gap-1">
                {(["today", "yesterday", "last7days", "last30days"] as DateRangeKey[]).map(
                  (key) => {
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
                  }
                )}
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
                    const isExpanded = !!expandedCampaigns[c.id];

                    const zonesSorted = [...c.zones].sort(
                      (a, b) => b.cost - a.cost
                    );
                    const creativesSorted = [...c.creatives].sort(
                      (a, b) => b.cost - a.cost
                    );

                    return (
                      <React.Fragment key={c.id}>
                        {/* Main campaign row */}
                        <tr className="border-b border-slate-800/60 align-top">
                          <td className="px-2 py-2">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => toggleCampaignExpanded(c.id)}
                                className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-700 bg-slate-900 text-[10px] text-slate-200 hover:border-slate-500"
                                aria-label={
                                  isExpanded
                                    ? "Collapse campaign details"
                                    : "Expand campaign details"
                                }
                              >
                                {isExpanded ? "▼" : "▶"}
                              </button>
                              <div>
                                <div className="text-[11px] whitespace-normal">
                                  {c.name}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {c.trafficSource}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-left text-[11px]">
                            {country}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(c.visits).toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(c.signups).toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(c.deposits).toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(c.deposits) > 0
                              ? `$${Number(c.cpa).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "–"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(c.signups) > 0
                              ? `$${Number(c.cpr).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "–"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            $
                            {Number(c.revenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${
                              Number(c.profit) >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {Number(c.profit) >= 0 ? "$" : "-$"}
                            {Math.abs(Number(c.profit)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${
                              Number(c.roi) >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {Number(c.roi).toFixed(1)}%
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="border-b border-slate-800/60">
                            <td
                              colSpan={10}
                              className="bg-slate-950 px-3 py-3"
                            >
                              <div className="grid gap-3 md:grid-cols-2">
                                {/* Zones */}
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-[11px] font-semibold text-slate-200">
                                      Zones breakdown
                                    </h3>
                                    <span className="text-[10px] text-slate-500">
                                      {zonesSorted.length.toLocaleString()} zones
                                    </span>
                                  </div>
                                  {zonesSorted.length === 0 ? (
                                    <div className="text-[11px] text-slate-500 bg-slate-900/70 rounded-xl px-3 py-2">
                                      No zone data for this campaign in this
                                      range.
                                    </div>
                                  ) : (
                                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                                      <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-[10px]">
                                          <thead className="bg-slate-900 text-slate-400 uppercase">
                                            <tr>
                                              <th className="text-left px-2 py-1">
                                                Zone
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Visits
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Rev
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Cost
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                ROI%
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {zonesSorted.map((z) => (
                                              <tr
                                                key={`${c.id}-zone-${z.id}`}
                                                className="border-t border-slate-800/60"
                                              >
                                                <td className="px-2 py-1 text-left">
                                                  {z.id || "(no id)"}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  {z.visits.toLocaleString()}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  $
                                                  {z.revenue.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  $
                                                  {z.cost.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </td>
                                                <td
                                                  className={`px-2 py-1 text-right ${
                                                    z.roi >= 0
                                                      ? "text-emerald-400"
                                                      : "text-rose-400"
                                                  }`}
                                                >
                                                  {z.roi.toFixed(1)}%
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Creatives */}
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-[11px] font-semibold text-slate-200">
                                      Creatives breakdown
                                    </h3>
                                    <span className="text-[10px] text-slate-500">
                                      {creativesSorted.length.toLocaleString()} creatives
                                    </span>
                                  </div>
                                  {creativesSorted.length === 0 ? (
                                    <div className="text-[11px] text-slate-500 bg-slate-900/70 rounded-xl px-3 py-2">
                                      No creative data for this campaign in this
                                      range.
                                    </div>
                                  ) : (
                                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                                      <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-[10px]">
                                          <thead className="bg-slate-900 text-slate-400 uppercase">
                                            <tr>
                                              <th className="text-left px-2 py-1">
                                                Creative
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Visits
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Rev
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                Cost
                                              </th>
                                              <th className="text-right px-2 py-1">
                                                ROI%
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {creativesSorted.map((cr) => (
                                              <tr
                                                key={`${c.id}-creative-${cr.id}`}
                                                className="border-t border-slate-800/60"
                                              >
                                                <td className="px-2 py-1 text-left">
                                                  {cr.name ||
                                                    cr.id ||
                                                    "(no name)"}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  {cr.visits.toLocaleString()}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  $
                                                  {cr.revenue.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </td>
                                                <td className="px-2 py-1 text-right">
                                                  $
                                                  {cr.cost.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </td>
                                                <td
                                                  className={`px-2 py-1 text-right ${
                                                    cr.roi >= 0
                                                      ? "text-emerald-400"
                                                      : "text-rose-400"
                                                  }`}
                                                >
                                                  {cr.roi.toFixed(1)}%
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
        <aside className="w-full max-w-5xl mx-auto flex-shrink-0">
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

            {/* Auto insights (rule-based) */}
            <div className="space-y-2 text-xs max-h-40 overflow-y-auto pr-1 mb-2">
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

            {/* Chat history */}
            <div className="flex-1 border-t border-slate-800 pt-2 mt-1 flex flex-col">
              <div className="text-[10px] text-slate-400 mb-1">
                Ask the AI about this view (OpenAI-powered):
              </div>
              <div className="flex-1 space-y-2 text-xs overflow-y-auto pr-1 mb-2">
                {chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl px-3 py-2 ${
                      m.role === "user"
                        ? "bg-sky-900/60 text-sky-50"
                        : "bg-slate-800/80 text-slate-50"
                    }`}
                  >
                    <div className="text-[10px] mb-0.5 opacity-70 flex items-center justify-between">
                      <span>{m.role === "user" ? "You" : "Assistant"}</span>
                      {m.role === "assistant" && m.usage && (
                        <span className="text-[10px] text-slate-400">
                          Tokens: in {m.usage.promptTokens ?? "-"} • out {m.usage.completionTokens ?? "-"}
                          {typeof m.usage.totalTokens === "number" && (
                            <>
                              {" "}• total {m.usage.totalTokens}
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <pre className="whitespace-pre-wrap text-[11px] leading-relaxed">
                      {m.content}
                    </pre>
                  </div>
                ))}

                {chatLoading && (
                  <div className="text-[11px] text-slate-400">
                    Thinking about your question…
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="mt-auto pt-1 border-t border-slate-800">
                <div className="flex gap-2 mt-1">
                  <input
                    className="flex-1 bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-1.5 placeholder:text-slate-500"
                    placeholder='e.g. "Which MY campaigns should I pause?"'
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    disabled={chatLoading}
                  />
                  <button
                    className="text-xs px-3 py-1.5 rounded-xl bg-slate-700 text-slate-50 disabled:opacity-60"
                    onClick={handleSendChat}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    {chatLoading ? "..." : "Ask"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
