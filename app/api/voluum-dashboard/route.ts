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

type DateRangeKey = "today" | "yesterday" | "last3days" | "last7days" | "last30days" | "custom";

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
  const dateRangeParam = (searchParams.get("dateRange") as DateRangeKey | null) || "last7days";
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

  let to = parseDateParam(toParam, true) || new Date();
  // Normalize minutes/seconds if no explicit to provided
  if (!toParam) to.setUTCMinutes(0, 0, 0);

  let from = parseDateParam(fromParam, false) || new Date(to);

  if (!fromParam || dateRangeParam !== "custom") {
    // Use preset ranges when custom not explicitly requested
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
    }
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

    const reportUrl = `${base.replace(/\/$/, "")}/report?${params.toString()}`;

    const reportRes = await fetch(reportUrl, {
      method: "GET",
      headers: {
        "cwauth-token": token,
        Accept: "application/json",
      },
    });

    const reportText = await reportRes.text();
    let reportJson: any = null;
    try {
      reportJson = reportText ? JSON.parse(reportText) : null;
    } catch {
      // ignore
    }

    if (!reportRes.ok || !reportJson) {
      return NextResponse.json(
        {
          step: "report",
          reportCalledUrl: reportUrl,
          status: reportRes.status,
          ok: reportRes.ok,
          body: reportJson || reportText,
          message: "Voluum /report call failed. Check parameters in code.",
        },
        { status: 500 }
      );
    }

    const rows: any[] = reportJson.rows || reportJson.data || [];

    const campaigns: DashboardCampaign[] = [];

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

    return NextResponse.json(
      {
        dateRange: dateRangeParam,
        from: fromIso,
        to: toIso,
        kpis,
        campaigns,
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
