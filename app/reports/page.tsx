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

  const [loadingOptions, setLoadingOptions] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<ReportRow[]>([]);

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
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 text-slate-50">
      <h1 className="text-xl font-semibold mb-2">Reports</h1>
      <p className="text-[12px] text-slate-400 mb-4">Build a campaign report from Voluum with custom dates and campaign selection.</p>

      {/* Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date presets */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1">Date range</div>
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
            <div className="text-[11px] text-slate-400 mb-1">From</div>
            <input type="date" className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[12px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-1">To</div>
            <input type="date" className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[12px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          {/* Campaign selector */}
          <div className="min-w-[280px] flex-1">
            <div className="text-[11px] text-slate-400 mb-1">Campaigns ({selectedCount} selected)</div>
            <div className="bg-slate-950 border border-slate-700 rounded-md max-h-40 overflow-y-auto p-2">
              {loadingOptions ? (
                <div className="text-[12px] text-slate-400">Loading campaigns…</div>
              ) : campaignOptions.length === 0 ? (
                <div className="text-[12px] text-slate-400">No campaigns found.</div>
              ) : (
                <ul className="space-y-1 text-[12px]">
                  {campaignOptions.map((c) => (
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
              <button onClick={selectAll} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900">Select all</button>
              <button onClick={clearSelection} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900">Clear</button>
            </div>
          </div>

          {/* Run */}
          <div className="ml-auto flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Group by</div>
              <select value={groupBy} onChange={(e)=>setGroupBy(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[12px]">
                <option value="campaign">Campaign</option>
                <option value="day">Day</option>
                <option value="country">Country</option>
                <option value="traffic-source">Traffic source</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Timezone</div>
              <select value={tz} onChange={(e)=>setTz(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[12px]">
                <option value="Asia/Singapore">GMT+8 (Asia/Singapore)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchReport}
                disabled={loadingReport}
                className="text-sm px-4 py-2 rounded-lg bg-emerald-500 text-slate-900 disabled:opacity-60"
              >
                {loadingReport ? "Running…" : "Run report"}
              </button>
              <button
                onClick={downloadCsv}
                disabled={rows.length === 0}
                className="text-sm px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-50 disabled:opacity-60"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-3 text-[12px] text-rose-400">{error}</div>
        )}
      </div>

      {/* Results */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Results</h2>
          <span className="text-[11px] text-slate-400">{rows.length.toLocaleString()} rows • TZ: {tz === "Asia/Singapore" ? "GMT+8" : tz}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
              <tr>
                <th className="text-left px-2 py-2">{groupBy === "day" ? "Day" : groupBy === "country" ? "Country" : groupBy === "traffic-source" ? "Traffic source" : "Campaign"}</th>
                {groupBy === "campaign" && (
                  <th className="text-left px-2 py-2">Source</th>
                )}
                <th className="text-right px-2 py-2">Visits</th>
                <th className="text-right px-2 py-2">Signups</th>
                <th className="text-right px-2 py-2">Deposits</th>
                <th className="text-right px-2 py-2">Revenue</th>
                <th className="text-right px-2 py-2">Cost</th>
                <th className="text-right px-2 py-2">Profit</th>
                <th className="text-right px-2 py-2">ROI%</th>
                <th className="text-right px-2 py-2">CPR</th>
                <th className="text-right px-2 py-2">CPA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
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
                  <tr key={`${label}-${idx}`} className="border-b border-slate-800/60">
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
                  <td className="px-2 py-4 text-center text-slate-400 text-[11px]" colSpan={groupBy === "campaign" ? 11 : 10}>Running report…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
