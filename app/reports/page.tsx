"use client";

import React, { useEffect, useMemo, useState } from "react";

type DateRangeKey =
  | "today"
  | "yesterday"
  | "last3days"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "custom";

type CampaignLite = { id: string; name: string; trafficSource?: string };

type ReportRow = {
  campaignId?: string;
  campaignName?: string;
  trafficSourceName?: string;
  visits?: number;
  conversions?: number;
  customConversions1?: number; // signups
  customConversions2?: number; // deposits
  revenue?: number;
  cost?: number;
  profit?: number;
  roi?: number;
  CPR?: number;
  CostPerSignup?: number;
};

function formatMoney(n: number | undefined | null) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRangeKey>("last7days");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return ymd(d);
  });
  const [to, setTo] = useState<string>(() => ymd(new Date()));
  const [groupBy, setGroupBy] = useState<string>("campaign"); // campaign | day | country | traffic-source
  const [tz, setTz] = useState<string>("Asia/Singapore"); // GMT+8

  const [campaignOptions, setCampaignOptions] = useState<CampaignLite[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [loadingOptions, setLoadingOptions] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [sortConfig, setSortConfig] = useState<{key: string; direction: 'asc'|'desc'} | null>(null);

  // Load campaign list (from dashboard API) when date range changes
  useEffect(() => {
    (async () => {
      try {
        setLoadingOptions(true);
        setError(null);
        const res = await fetch(`/api/voluum-dashboard?dateRange=${dateRange}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || json?.message || `Failed: ${res.status}`);
        const items: CampaignLite[] = Array.isArray(json?.campaigns)
          ? json.campaigns.map((c: any) => ({ id: String(c.id || c.campaignId || c.campaignName), name: String(c.name || c.campaignName || "(unnamed)"), trafficSource: c.trafficSource || c.trafficSourceName || undefined }))
          : [];
        items.sort((a, b) => a.name.localeCompare(b.name));
        setCampaignOptions(items);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, [dateRange]);

  // Apply preset date ranges (also fill from/to)
  useEffect(() => {
    if (dateRange !== "custom") {
      const end = new Date();
      const start = new Date(end);
      if (dateRange === "today") {
        // keep 'to' today, set 'from' today
      } else if (dateRange === "yesterday") {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
      } else if (dateRange === "last3days") {
        start.setDate(start.getDate() - 3);
      } else if (dateRange === "last7days") {
        start.setDate(start.getDate() - 7);
      } else if (dateRange === "last30days") {
        start.setDate(start.getDate() - 30);
      } else if (dateRange === "thismonth") {
        start.setDate(1);
      }
      setFrom(ymd(start));
      setTo(ymd(end));
    }
  }, [dateRange]);

  const selectedCount = selectedCampaignIds.length;

  // Filter campaigns by search query
  const filteredCampaigns = useMemo(() => {
    if (!searchQuery.trim()) return campaignOptions;
    const q = searchQuery.toLowerCase();
    return campaignOptions.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.trafficSource?.toLowerCase().includes(q)
    );
  }, [campaignOptions, searchQuery]);

  // Sort and calculate totals for rows
  const sortedRows = useMemo(() => {
    let sorted = [...rows];
    if (sortConfig) {
      sorted.sort((a, b) => {
        let aVal: any = (a as any)[sortConfig.key];
        let bVal: any = (b as any)[sortConfig.key];
        if (sortConfig.key === 'label') {
          aVal = groupBy === "day" ? (a as any).day : groupBy === "country" ? (a as any).country : groupBy === "traffic-source" ? a.trafficSourceName : a.campaignName;
          bVal = groupBy === "day" ? (b as any).day : groupBy === "country" ? (b as any).country : groupBy === "traffic-source" ? b.trafficSourceName : b.campaignName;
          return sortConfig.direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
        }
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    return sorted;
  }, [rows, sortConfig, groupBy]);

  const totals = useMemo(() => {
    const t = {
      visits: 0,
      signups: 0,
      deposits: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    rows.forEach(r => {
      t.visits += Number(r.visits || 0);
      t.signups += Number(r.customConversions1 || 0);
      t.deposits += Number(r.customConversions2 || 0);
      t.revenue += Number(r.revenue || 0);
      t.cost += Number(r.cost || 0);
      t.profit += typeof r.profit === 'number' ? r.profit : (Number(r.revenue||0) - Number(r.cost||0));
    });
    return t;
  }, [rows]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? {key, direction: 'desc'} : null;
      }
      return {key, direction: 'asc'};
    });
  };

  const fetchReport = async () => {
    try {
      setLoadingReport(true);
      setError(null);
      const usp = new URLSearchParams();
      usp.set("dateRange", dateRange);
      usp.set("from", from);
      usp.set("to", to);
      usp.set("tz", tz);
      if (selectedCampaignIds.length) usp.set("campaignIds", selectedCampaignIds.join(","));
      usp.set("groupBy", groupBy);
      const res = await fetch(`/api/voluum/report?${usp.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || `Failed: ${res.status}`);
      const r: ReportRow[] = Array.isArray(json?.rows) ? json.rows : [];
      setRows(r);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    // Auto-run on load
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedCampaignIds([]);
  const selectAll = () => setSelectedCampaignIds(campaignOptions.map((c) => c.id));

  // CSV export of current rows
  const downloadCsv = () => {
    const headers = [
      groupBy === "day" ? "day" : groupBy === "country" ? "country" : groupBy === "traffic-source" ? "trafficSourceName" : "campaignName",
      "visits",
      "customConversions1",
      "customConversions2",
      "revenue",
      "cost",
      "profit",
      "roi",
      "CPR",
      "CostPerSignup",
    ];
    const lines = [headers.join(",")];
    rows.forEach((r, idx) => {
      const label = groupBy === "day"
        ? (r as any).day || ""
        : groupBy === "country"
        ? (r as any).country || (r as any).countryCode || (r as any).countryName || ""
        : groupBy === "traffic-source"
        ? r.trafficSourceName || ""
        : r.campaignName || r.campaignId || `row-${idx}`;
      const vals = [
        JSON.stringify(String(label)),
        Number(r.visits || 0),
        Number(r.customConversions1 || 0),
        Number(r.customConversions2 || 0),
        Number(r.revenue || 0).toFixed(2),
        Number(r.cost || 0).toFixed(2),
        (typeof r.profit === "number" ? r.profit : Number(r.revenue || 0) - Number(r.cost || 0)).toFixed(2),
        Number(r.roi || 0).toFixed(2),
        Number(r.CPR || 0).toFixed(2),
        Number(r.CostPerSignup || 0).toFixed(2),
      ];
      lines.push(vals.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tzShort = tz === "Asia/Singapore" ? "GMT+8" : tz.replace(/\//g, "-");
    a.download = `voluum-report-${groupBy}-${from}_to_${to}-${tzShort}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6 text-slate-50">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Reports</h1>
        <p className="text-[13px] text-slate-400">Build custom campaign reports from Voluum with date ranges, filters, and group-by options.</p>
      </div>

      {/* Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-lg">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date presets */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-2">Date range</div>
            <div className="flex flex-wrap gap-1">
              {(["today","yesterday","last3days","last7days","last30days","thismonth","custom"] as DateRangeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDateRange(key)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition ${dateRange===key?"bg-sky-500 text-slate-950 border-sky-400":"bg-slate-950 border-slate-700 text-slate-200 hover:border-slate-500"}`}
                >
                  {key === "last3days" ? "Last 3" : key === "last7days" ? "Last 7" : key === "last30days" ? "Last 30" : key === "thismonth" ? "This month" : key === "yesterday" ? "Yesterday" : key === "today" ? "Today" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* From/To */}
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-2">From</div>
            <input type="date" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[12px] hover:border-slate-600 focus:border-sky-500 focus:outline-none transition" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-2">To</div>
            <input type="date" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[12px] hover:border-slate-600 focus:border-sky-500 focus:outline-none transition" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          {/* Campaign selector */}
          <div className="min-w-[280px] flex-1">
            <div className="text-[11px] font-medium text-slate-400 mb-2">Campaigns <span className="text-sky-400">({selectedCount} selected)</span></div>
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[12px] mb-2 placeholder-slate-600 hover:border-slate-600 focus:border-sky-500 focus:outline-none transition"
            />
            <div className="bg-slate-950 border border-slate-700 rounded-lg max-h-44 overflow-y-auto p-2.5">
              {loadingOptions ? (
                <div className="text-[12px] text-slate-400 flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading campaigns…
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-[12px] text-slate-400">{searchQuery ? 'No matches found.' : 'No campaigns found.'}</div>
              ) : (
                <ul className="space-y-1 text-[12px]">
                  {filteredCampaigns.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <input id={`c-${c.id}`} type="checkbox" className="accent-sky-500" checked={selectedCampaignIds.includes(c.id)} onChange={() => toggleCampaign(c.id)} />
                      <label htmlFor={`c-${c.id}`} className="cursor-pointer flex-1">
                        <span className="text-slate-100">{c.name}</span>
                        {c.trafficSource && (
                          <span className="ml-2 text-slate-400">({c.trafficSource})</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={selectAll} className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-slate-600 transition">Select all</button>
              <button onClick={clearSelection} className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-slate-600 transition">Clear</button>
            </div>
          </div>

          {/* Run */}
          <div className="ml-auto flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-2">Group by</div>
              <select value={groupBy} onChange={(e)=>setGroupBy(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[12px] hover:border-slate-600 focus:border-sky-500 focus:outline-none transition">
                <option value="campaign">Campaign</option>
                <option value="day">Day</option>
                <option value="country">Country</option>
                <option value="traffic-source">Traffic source</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-2">Timezone</div>
              <select value={tz} onChange={(e)=>setTz(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[12px] hover:border-slate-600 focus:border-sky-500 focus:outline-none transition">
                <option value="Asia/Singapore">GMT+8 (Asia/Singapore)</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchReport}
                disabled={loadingReport}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-lg hover:shadow-emerald-500/20"
              >
                {loadingReport ? "Running…" : "Run report"}
              </button>
              <button
                onClick={downloadCsv}
                disabled={rows.length === 0}
                className="text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-50 hover:bg-slate-800 hover:border-slate-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[12px] text-rose-400">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-base font-semibold">Results</h2>
          <span className="text-[11px] text-slate-400 font-medium">{rows.length.toLocaleString()} rows • TZ: {tz === "Asia/Singapore" ? "GMT+8" : tz}</span>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800 text-slate-400 text-[10px] uppercase sticky top-0 bg-slate-900">
              <tr>
                <th onClick={() => handleSort('label')} className="text-left px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center gap-1">
                    {groupBy === "day" ? "Day" : groupBy === "country" ? "Country" : groupBy === "traffic-source" ? "Traffic source" : "Campaign"}
                    {sortConfig?.key === 'label' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                {groupBy === "campaign" && (
                  <th className="text-left px-2 py-2">Source</th>
                )}
                <th onClick={() => handleSort('visits')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Visits {sortConfig?.key === 'visits' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('customConversions1')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Signups {sortConfig?.key === 'customConversions1' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('customConversions2')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Deposits {sortConfig?.key === 'customConversions2' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('revenue')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Revenue {sortConfig?.key === 'revenue' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('cost')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Cost {sortConfig?.key === 'cost' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('profit')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">Profit {sortConfig?.key === 'profit' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th onClick={() => handleSort('roi')} className="text-right px-2 py-2 cursor-pointer hover:text-slate-200 select-none">
                  <div className="flex items-center justify-end gap-1">ROI% {sortConfig?.key === 'roi' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                </th>
                <th className="text-right px-2 py-2">CPR</th>
                <th className="text-right px-2 py-2">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, idx) => {
                const label = groupBy === "day"
                  ? (r as any).day || `row-${idx}`
                  : groupBy === "country"
                  ? (r as any).country || (r as any).countryCode || (r as any).countryName || `row-${idx}`
                  : groupBy === "traffic-source"
                  ? r.trafficSourceName || `row-${idx}`
                  : String(r.campaignName || r.campaignId || `row-${idx}`);
                const source = String(r.trafficSourceName || "");
                const visits = Number(r.visits || 0);
                const signups = Number(r.customConversions1 || 0);
                const deposits = Number(r.customConversions2 || 0);
                const revenue = Number(r.revenue || 0);
                const cost = Number(r.cost || 0);
                const profit = typeof r.profit === "number" ? r.profit : revenue - cost;
                const roi = Number(r.roi || (cost !== 0 ? (profit / cost) * 100 : 0));
                const cpr = Number(r.CPR || (signups > 0 ? cost / signups : 0));
                const cpa = Number(r.CostPerSignup || (deposits > 0 ? cost / deposits : 0));
                return (
                  <tr key={`${label}-${idx}`} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition">
                    <td className="px-2 py-2 text-left text-[11px]">{String(label)}</td>
                    {groupBy === "campaign" && (
                      <td className="px-2 py-2 text-left text-[11px]">{source}</td>
                    )}
                    <td className="px-2 py-2 text-right">{visits.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">{signups.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">{deposits.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(revenue)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(cost)}</td>
                    <td className={`px-2 py-2 text-right ${profit>=0?"text-emerald-400":"text-rose-400"}`}>{formatMoney(profit)}</td>
                    <td className={`px-2 py-2 text-right ${roi>=0?"text-emerald-400":"text-rose-400"}`}>{roi.toFixed(1)}%</td>
                    <td className="px-2 py-2 text-right">{cpr>0?formatMoney(cpr):"–"}</td>
                    <td className="px-2 py-2 text-right">{cpa>0?formatMoney(cpa):"–"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loadingReport && (
                <tr>
                  <td className="px-2 py-4 text-center text-slate-500 text-[11px]" colSpan={groupBy === "campaign" ? 11 : 10}>No data for this selection.</td>
                </tr>
              )}
              {loadingReport && (
                <tr>
                  <td className="px-2 py-4 text-center text-slate-400 text-[11px]" colSpan={groupBy === "campaign" ? 11 : 10}>
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Running report…
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-700 bg-slate-900/50 font-semibold">
                <tr>
                  <td className="px-2 py-2 text-left text-[11px]">TOTALS</td>
                  {groupBy === "campaign" && <td className="px-2 py-2"></td>}
                  <td className="px-2 py-2 text-right text-[11px]">{totals.visits.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-[11px]">{totals.signups.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-[11px]">{totals.deposits.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-[11px]">{formatMoney(totals.revenue)}</td>
                  <td className="px-2 py-2 text-right text-[11px]">{formatMoney(totals.cost)}</td>
                  <td className={`px-2 py-2 text-right text-[11px] ${totals.profit>=0?"text-emerald-400":"text-rose-400"}`}>{formatMoney(totals.profit)}</td>
                  <td className={`px-2 py-2 text-right text-[11px] ${(totals.cost!==0?(totals.profit/totals.cost)*100:0)>=0?"text-emerald-400":"text-rose-400"}`}>{totals.cost!==0?((totals.profit/totals.cost)*100).toFixed(1):"0.0"}%</td>
                  <td className="px-2 py-2 text-right text-[11px]">{totals.signups>0?formatMoney(totals.cost/totals.signups):"–"}</td>
                  <td className="px-2 py-2 text-right text-[11px]">{totals.deposits>0?formatMoney(totals.cost/totals.deposits):"–"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
