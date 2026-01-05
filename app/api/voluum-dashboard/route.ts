// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

/**
 * Types
 */
type DashboardZone = {
  id: string;
  visits: number;
  conversions: number;
  signups: number;
  deposits: number;
  revenue: number;
  cost: number;
  roi: number;
};

type DashboardCreative = {
  id: string;
  name?: string;
  visits: number;
  conversions: number;
  signups: number;
  deposits: number;
  revenue: number;
  cost: number;
  roi: number;
};

type DashboardCampaign = {
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
  zones: DashboardZone[];
  creatives: DashboardCreative[];
};

type DashboardKpiCard = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
};

type DashboardSeriesPoint = {
  date: string; // ISO or YYYY-MM-DD
  cost: number;
  revenue: number;
  profit: number;
  signups: number;
  deposits: number;
  cpa: number | null; // cost per deposit
  cpr: number | null; // cost per signup
};

type DateRangeKey =
  | "today"
  | "yesterday"
  | "last3days"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "custom"
  // treat Voluum-style name as alias of custom
  | "custom-date-time";

/**
 * Simple sleep helper (if you ever want to add spacing between calls)
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How many campaigns get detailed zones/creatives
 * You can override via env: VOLUUM_MAX_DETAIL_CAMPAIGNS=3
 */
const MAX_DETAIL_CAMPAIGNS =
  Number(process.env.VOLUUM_MAX_DETAIL_CAMPAIGNS || "3");
const DETAIL_THROTTLE_MS = Number(process.env.VOLUUM_DETAIL_THROTTLE_MS || "300");

async function backoff(attempt: number, base: number) {
  const jitter = Math.floor(Math.random() * base);
  const delay = base * Math.pow(2, attempt) + jitter;
  await sleep(delay);
}

/**
 * Fetch zones for a specific campaign
 * Uses your real Voluum URL pattern:
 *   groupBy=custom-variable-1  (V1: zoneid)
 */
async function fetchZonesForCampaign(
  base: string,
  token: string,
  fromIso: string,
  toIso: string,
  campaignId: string
): Promise<DashboardZone[]> {
  try {
    const params = new URLSearchParams({
      reportType: "tree",
      reportDataType: "3",
      limit: "100",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      searchMode: "TEXT",
      currency: "MYR",
      sort: "visits",
      direction: "DESC",
      offset: "0",
      groupBy: "custom-variable-1", // V1: zoneid
      conversionTimeMode: "CONVERSION",
      tz: "Asia/Singapore",
    });

    const columns = [
      "profit",
      "externalName",
      "customVariable1Marker",
      "visits",
      "uniqueVisits",
      "suspiciousVisitsPercentage",
      "conversions",
      "costSources",
      "cost",
      "revenue",
      "roi",
      "cv",
      "epv",
      "cpv",
      "errors",
      "CPR",
      "ConversionRate",
      "CostPerFTD",
      "CostPerSignup",
      "customConversions1",
      "customRevenue1",
      "customConversions2",
      "customRevenue2",
      "customConversions3",
      "customRevenue3",
      "customVariable2Marker",
      "actions",
      "type",
      "clicks",
      "suspiciousClicksPercentage",
      "suspiciousVisits",
      "suspiciousClicks",
      "customVariable1", // the actual zoneid value
      "customVariable4",
      "customVariable2",
    ];

    columns.forEach((c) => params.append("column", c));

    // Filter by campaign
    params.append("filter1", "campaign");
    params.append("filter1Value", campaignId);

    const url = `${base.replace(/\/$/, "")}/report?${params.toString()}`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, {
        method: "GET",
        headers: {
          "cwauth-token": token,
          Accept: "application/json",
        },
      });
      if (res.status !== 429 && res.status < 500) break;
      await backoff(attempt, 400);
    }
    if (!res) throw new Error("No response from Voluum zones");

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }

    if (!res.ok || !json?.rows) {
      console.warn("[Voluum] fetchZonesForCampaign failed:", res.status, text);
      return [];
    }

    const rows: any[] = json.rows || json.data || [];

    return rows.map((row) => ({
      id: String(row.customVariable1 ?? row.externalName ?? "unknown"),
      visits: Number(row.visits ?? 0),
      conversions: Number(row.conversions ?? 0),
      signups: Number(row.customConversions1 ?? 0), // signups
      deposits: Number(row.customConversions2 ?? 0), // deposits
      revenue: Number(row.revenue ?? 0),
      cost: Number(row.cost ?? 0),
      roi: Number(row.roi ?? 0),
    }));
  } catch (err) {
    console.error("[Voluum] fetchZonesForCampaign error:", err);
    return [];
  }
}

/**
 * Fetch creatives for a specific campaign
 * Mirrors zones, but with:
 *   groupBy=custom-variable-2  (V2: bannerid)
 */
async function fetchCreativesForCampaign(
  base: string,
  token: string,
  fromIso: string,
  toIso: string,
  campaignId: string
): Promise<DashboardCreative[]> {
  try {
    const params = new URLSearchParams({
      reportType: "tree",
      reportDataType: "3",
      limit: "100",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      searchMode: "TEXT",
      currency: "MYR",
      sort: "visits",
      direction: "DESC",
      offset: "0",
      groupBy: "custom-variable-2", // V2: bannerid
      conversionTimeMode: "CONVERSION",
      tz: "Asia/Singapore",
    });

    const columns = [
      "profit",
      "externalName",
      "customVariable2Marker",
      "visits",
      "uniqueVisits",
      "suspiciousVisitsPercentage",
      "conversions",
      "costSources",
      "cost",
      "revenue",
      "roi",
      "cv",
      "epv",
      "cpv",
      "errors",
      "CPR",
      "ConversionRate",
      "CostPerFTD",
      "CostPerSignup",
      "customConversions1",
      "customRevenue1",
      "customConversions2",
      "customRevenue2",
      "customConversions3",
      "customRevenue3",
      "actions",
      "type",
      "clicks",
      "suspiciousClicksPercentage",
      "suspiciousVisits",
      "suspiciousClicks",
      "customVariable2", // the actual bannerid value
      "customVariable1",
      "customVariable4",
    ];

    columns.forEach((c) => params.append("column", c));

    params.append("filter1", "campaign");
    params.append("filter1Value", campaignId);

    const url = `${base.replace(/\/$/, "")}/report?${params.toString()}`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, {
        method: "GET",
        headers: {
          "cwauth-token": token,
          Accept: "application/json",
        },
      });
      if (res.status !== 429 && res.status < 500) break;
      await backoff(attempt, 400);
    }
    if (!res) throw new Error("No response from Voluum creatives");

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }

    if (!res.ok || !json?.rows) {
      console.warn(
        "[Voluum] fetchCreativesForCampaign failed:",
        res.status,
        text
      );
      return [];
    }

    const rows: any[] = json.rows || json.data || [];

    return rows.map((row) => ({
      id: String(row.customVariable2 ?? row.externalName ?? "unknown"),
      name: row.externalName,
      visits: Number(row.visits ?? 0),
      conversions: Number(row.conversions ?? 0),
      signups: Number(row.customConversions1 ?? 0),
      deposits: Number(row.customConversions2 ?? 0),
      revenue: Number(row.revenue ?? 0),
      cost: Number(row.cost ?? 0),
      roi: Number(row.roi ?? 0),
    }));
  } catch (err) {
    console.error("[Voluum] fetchCreativesForCampaign error:", err);
    return [];
  }
}

/**
 * Main GET handler – campaigns + KPIs (+ zones/creatives for first N campaigns)
 */
export async function GET(request: Request) {
  const base = process.env.VOLUUM_API_BASE;
  const accessId = process.env.VOLUUM_ACCESS_ID;
  const accessKey = process.env.VOLUUM_ACCESS_KEY;

  if (!base || !accessId || !accessKey) {
    return NextResponse.json(
      {
        error:
          "Missing VOLUUM_ACCESS_ID, VOLUUM_ACCESS_KEY or VOLUUM_API_BASE. Check .env.local.",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawDateRange = (searchParams.get("dateRange") as DateRangeKey | null) || null;
  const trafficSourceFilter = (searchParams.get("trafficSource") || "all").toString();
  const countryFilter = (searchParams.get("country") || "all").toString().toUpperCase();
  // Normalize dateRange: support both "custom" and "custom-date-time" as custom
  const dateRangeParam: DateRangeKey = (rawDateRange === "custom-date-time"
    ? "custom"
    : (rawDateRange as DateRangeKey)) || "last7days";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  function parseDateParam(val: string | null, endOfDay: boolean): Date | null {
    if (!val) return null;
    // Accept ISO or YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const t = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
      const d = new Date(val + t);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  // Determine from/to with clear precedence:
  // 1) If both from & to are provided, honor them regardless of dateRange value
  // 2) Else, compute from dateRange presets
  // 3) Fallback to last7days if nothing provided
  let to: Date;
  let from: Date;

  const parsedTo = parseDateParam(toParam, true);
  const parsedFrom = parseDateParam(fromParam, false);

  if (parsedFrom && parsedTo) {
    from = parsedFrom;
    to = parsedTo;
  } else {
    // Start with 'to' as now or parsed value if only one provided
    to = parsedTo || new Date();
    if (!toParam && !parsedTo) {
      // Normalize minutes/seconds when using "now" default
      to.setUTCMinutes(0, 0, 0);
    }

    from = parsedFrom || new Date(to);

    // If from/to not fully provided, use preset ranges unless explicit custom
    if (!parsedFrom || !parsedTo || dateRangeParam !== "custom") {
      if (dateRangeParam === "today") {
        from = new Date(to);
        from.setUTCHours(0, 0, 0, 0);
      } else if (dateRangeParam === "yesterday") {
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 1);
        from.setUTCHours(0, 0, 0, 0);
        to = new Date(from);
        to.setUTCHours(23, 59, 59, 999);
      } else if (dateRangeParam === "last30days") {
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 30);
        from.setUTCHours(0, 0, 0, 0);
      } else if (dateRangeParam === "last7days") {
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 7);
        from.setUTCHours(0, 0, 0, 0);
      } else if (dateRangeParam === "last3days") {
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 3);
        from.setUTCHours(0, 0, 0, 0);
      } else if (dateRangeParam === "thismonth") {
        from = new Date(to);
        // set to first day of this month UTC
        from.setUTCDate(1);
        from.setUTCHours(0, 0, 0, 0);
      }
    }
  }

  // Safety: if caller provided custom range with from > to, swap to avoid provider errors
  if (from.getTime() > to.getTime()) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // 1) Auth
  const authUrl = `${base.replace(/\/$/, "")}/auth/access/session`;

  try {
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accessId,
        accessKey,
      }),
    });

    const authJson = await authRes.json().catch(() => null);

    if (!authRes.ok || !authJson?.token) {
      return NextResponse.json(
        {
          step: "auth",
          calledUrl: authUrl,
          status: authRes.status,
          ok: authRes.ok,
          body: authJson,
          message:
            "Failed to obtain cwauth-token. Check access ID / key and Voluum API settings.",
        },
        { status: 500 }
      );
    }

    const token = authJson.token as string;

    // 2) Campaign report
    const params = new URLSearchParams({
      reportType: "table",
      limit: "100",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      searchMode: "TEXT",
      offset: "0",
      include: "ACTIVE",
      currency: "MYR",
      sort: "visits",
      direction: "DESC",
      groupBy: "campaign",
      conversionTimeMode: "CONVERSION",
      tz: "Asia/Singapore",
    });

    const campaignColumns = [
      "campaignId",
      "campaignName",
      "trafficSourceName",
      "profit",
      "ConversionRate",
      "CostPerSignup",
      "CPR",
      "CostPerFTD",
      "customConversions1",
      "customConversions2",
      "customConversions3",
      "customRevenue1",
      "customRevenue2",
      "customRevenue3",
      "costSources",
      "cost",
      "visits",
      "conversions",
      "roi",
      "revenue",
      "clicks",
    ];

    campaignColumns.forEach((col) => params.append("column", col));

    // Helper to set filters on a given URLSearchParams instance
    const setFilters = (p: URLSearchParams, ts: string | undefined, cc: string | undefined) => {
      if (ts && ts !== "all") {
        p.append("filter1", "trafficSource");
        p.append("filter1Value", ts);
      }
      if (cc && cc !== "ALL") {
        const fKey = p.has("filter1") ? "filter2" : "filter1";
        const fVal = p.has("filter1") ? "filter2Value" : "filter1Value";
        p.append(fKey, "country");
        p.append(fVal, cc);
      }
    };

    // Attempt with both filters, then fall back progressively if the provider rejects the combination
    const tryReport = async (ts?: string, cc?: string) => {
      const p = new URLSearchParams(params.toString());
      setFilters(p, ts, cc);
      const url = `${base.replace(/\/$/, "")}/report?${p.toString()}`;
      const res = await fetch(url, { method: "GET", headers: { "cwauth-token": token, Accept: "application/json" } });
      const txt = await res.text();
      let js: any = null; try { js = txt ? JSON.parse(txt) : null; } catch {}
      return { res, js, txt, url } as const;
    };

    let reportAttempt = await tryReport(trafficSourceFilter, countryFilter);
    if (!reportAttempt.res.ok || !reportAttempt.js?.rows) {
      reportAttempt = await tryReport(trafficSourceFilter, undefined);
    }
    if (!reportAttempt.res.ok || !reportAttempt.js?.rows) {
      reportAttempt = await tryReport(undefined, countryFilter);
    }
    if (!reportAttempt.res.ok || !reportAttempt.js?.rows) {
      reportAttempt = await tryReport(undefined, undefined);
    }
    if (!reportAttempt.res.ok || !reportAttempt.js) {
      return NextResponse.json(
        {
          step: "report",
          reportCalledUrl: reportAttempt.url,
          status: reportAttempt.res.status,
          ok: reportAttempt.res.ok,
          body: reportAttempt.js || reportAttempt.txt,
          message: "Voluum /report call failed after fallback attempts.",
        },
        { status: 500 }
      );
    }

    const reportJson = reportAttempt.js;

    const rows: any[] = reportJson.rows || reportJson.data || [];

    let campaigns: DashboardCampaign[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const visits = Number(row.visits ?? 0);
      const conversions = Number(row.conversions ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);

      const profit = Number(
        typeof row.profit === "number" ? row.profit : revenue - cost
      );
      const roi = Number(row.roi ?? (cost !== 0 ? (profit / cost) * 100 : 0));

      const signups = Number(row.customConversions1 ?? 0);
      const deposits = Number(row.customConversions2 ?? 0);

      const cpa = Number(row.CostPerSignup ?? 0);
      const cpr = Number(row.CPR ?? 0);

      const campaignId: string =
        row.campaignId || row.campaignName || `row-${index}`;

      let zones: DashboardZone[] = [];
      let creatives: DashboardCreative[] = [];

      // Only fetch detailed breakdown for first N campaigns
      if (index < MAX_DETAIL_CAMPAIGNS) {
        zones = await fetchZonesForCampaign(base, token, fromIso, toIso, campaignId);
        await sleep(DETAIL_THROTTLE_MS);
        creatives = await fetchCreativesForCampaign(base, token, fromIso, toIso, campaignId);
        await sleep(DETAIL_THROTTLE_MS);
      }

      campaigns.push({
        id: campaignId,
        name: row.campaignName || "Unknown campaign",
        trafficSource: row.trafficSourceName || "Unknown source",
        visits,
        conversions,
        signups,
        deposits,
        revenue,
        profit,
        roi,
        cost,
        cpa,
        cpr,
        zones,
        creatives,
      });
    }

    // Apply server-side filters as a safety net (in case provider ignored filters)
    const inferCountryFromName = (name?: string): string | null => {
      if (!name) return null;
      const upper = String(name).toUpperCase();
      const m = upper.match(/(?:^|[^A-Z])(MY|MX|TH|ID|SG)(?:[^A-Z]|$)/);
      return m ? m[1] : null;
    };
    if (trafficSourceFilter && trafficSourceFilter !== "all") {
      campaigns = campaigns.filter((c) => c.trafficSource === trafficSourceFilter);
    }
    if (countryFilter && countryFilter !== "ALL") {
      campaigns = campaigns.filter((c) => inferCountryFromName(c.name) === countryFilter);
    }

    // 3) KPIs
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.visits += c.visits;
        acc.conversions += c.conversions;
        acc.revenue += c.revenue;
        acc.profit += c.profit;
        acc.cost += c.cost;
        acc.signups += c.signups;
        acc.deposits += c.deposits;
        return acc;
      },
      {
        visits: 0,
        conversions: 0,
        revenue: 0,
        profit: 0,
        cost: 0,
        signups: 0,
        deposits: 0,
      }
    );

    const signupCount = totals.signups;
    const depositCount = totals.deposits;
    const totalCost = totals.cost;

    const cpaTotal = depositCount > 0 ? totalCost / depositCount : 0;
    const cprTotal = signupCount > 0 ? totalCost / signupCount : 0;

    const activeCampaigns = campaigns.filter((c) => {
      return (
        (c.visits ?? 0) > 0 ||
        (c.cost ?? 0) > 0 ||
        (c.signups ?? 0) > 0 ||
        (c.deposits ?? 0) > 0 ||
        (c.conversions ?? 0) > 0
      );
    }).length;

    const usd = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const kpis: DashboardKpiCard[] = [
      {
        id: "activeCampaigns",
        label: "Active campaigns",
        value: activeCampaigns.toLocaleString(),
        delta: "–",
        positive: true,
      },
      {
        id: "visits",
        label: "Visits",
        value: totals.visits.toLocaleString(),
        delta: "–",
        positive: true,
      },
      {
        id: "signups",
        label: "Signups",
        value: signupCount.toLocaleString(),
        delta: "–",
        positive: true,
      },
      {
        id: "deposits",
        label: "Deposits",
        value: depositCount.toLocaleString(),
        delta: "–",
        positive: true,
      },
      {
        id: "revenue",
        label: "Revenue",
        value: usd.format(totals.revenue),
        delta: "–",
        positive: true,
      },
      {
        id: "profit",
        label: "Profit",
        value: usd.format(totals.profit),
        delta: "–",
        positive: totals.profit >= 0,
      },
      {
        id: "cpa",
        label: "CPA (per deposit)",
        value:
          depositCount > 0
            ? usd.format(cpaTotal)
            : totalCost > 0
            ? "No deposits"
            : usd.format(0),
        delta: "–",
        positive: cpaTotal > 0 ? cpaTotal < 1000000 : true,
      },
      {
        id: "cpr",
        label: "CPR (per signup)",
        value:
          signupCount > 0
            ? usd.format(cprTotal)
            : totalCost > 0
            ? "No signups"
            : usd.format(0),
        delta: "–",
        positive: cprTotal > 0 ? cprTotal < 1000000 : true,
      },
    ];

    // 4) Daily time series (group by day) – always last 30 days ending at current 'to'
    let series: DashboardSeriesPoint[] = [];
    try {
      // Compute fixed 30-day window regardless of requested dashboard range
      const seriesToDate = new Date(toIso);
      const seriesFromDate = new Date(seriesToDate);
      seriesFromDate.setUTCDate(seriesFromDate.getUTCDate() - 30);
      seriesFromDate.setUTCHours(0, 0, 0, 0);
      const seriesFromIso = seriesFromDate.toISOString();
      const seriesToIso = seriesToDate.toISOString();
      const tsParams = new URLSearchParams({
        reportType: "table",
        limit: "500",
        dateRange: "custom-date-time",
        from: seriesFromIso,
        to: seriesToIso,
        searchMode: "TEXT",
        offset: "0",
        currency: "MYR",
        sort: "visits",
        direction: "ASC",
        groupBy: "day",
        conversionTimeMode: "CONVERSION",
        tz: "Asia/Singapore",
      });
      const tsColumns = [
        "visits",
        "conversions",
        "customConversions1",
        "customConversions2",
        "revenue",
        "cost",
        "profit",
        "roi",
      ];
      tsColumns.forEach((c) => tsParams.append("column", c));
      const applyFiltersTo = (p: URLSearchParams, ts?: string, cc?: string) => {
        if (ts && ts !== "all") { p.append("filter1", "trafficSource"); p.append("filter1Value", ts); }
        if (cc && cc !== "ALL") { const fk = p.has("filter1")?"filter2":"filter1"; const fv=p.has("filter1")?"filter2Value":"filter1Value"; p.append(fk, "country"); p.append(fv, cc); }
      };
      // Try filters with fallback similar to campaigns
      const trySeries = async (ts?: string, cc?: string) => {
        const p = new URLSearchParams(tsParams.toString());
        applyFiltersTo(p, ts, cc);
        const url = `${base.replace(/\/$/, "")}/report?${p.toString()}`;
        const res = await fetch(url, { method: "GET", headers: { "cwauth-token": token, Accept: "application/json" } });
        const txt = await res.text();
        let js: any = null; try { js = txt ? JSON.parse(txt) : null; } catch {}
        return { res, js, txt } as const;
      };
      let tsAttempt = await trySeries(trafficSourceFilter, countryFilter);
      if (!tsAttempt.res.ok || !tsAttempt.js?.rows) tsAttempt = await trySeries(trafficSourceFilter, undefined);
      if (!tsAttempt.res.ok || !tsAttempt.js?.rows) tsAttempt = await trySeries(undefined, countryFilter);
      if (!tsAttempt.res.ok || !tsAttempt.js?.rows) tsAttempt = await trySeries(undefined, undefined);
      const tsJson: any = tsAttempt.js;
      const tsRows: any[] = (tsJson?.rows || tsJson?.data || []) as any[];
      if (Array.isArray(tsRows) && tsRows.length > 0) {
        series = tsRows.map((r, idx) => {
          const revenue = Number(r.revenue ?? 0);
          const cost = Number(r.cost ?? 0);
          const profit = Number(typeof r.profit === "number" ? r.profit : revenue - cost);
          const signups = Number(r.customConversions1 ?? 0);
          const deposits = Number(r.customConversions2 ?? 0);
          const cpa = deposits > 0 ? cost / deposits : null;
          const cpr = signups > 0 ? cost / signups : null;
          const d = String(r.day || r.date || r.startTime || r.ts || r.dayAsDate || "");
          return { date: d || String(idx), cost, revenue, profit, signups, deposits, cpa, cpr };
        });
      }
    } catch (e) {
      // ignore series failures to keep dashboard resilient
      console.warn("[Voluum] daily series failed:", e);
    }

    return NextResponse.json(
      {
        dateRange: dateRangeParam,
        from: fromIso,
        to: toIso,
        kpis,
        campaigns,
        series,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Voluum dashboard error:", err);
    return NextResponse.json(
      {
        error: "Error building Voluum dashboard",
        message: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
