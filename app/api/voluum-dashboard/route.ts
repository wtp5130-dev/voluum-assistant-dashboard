// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

/**
 * Types for zones, creatives, and campaigns
 */

type DashboardZone = {
  id: string;
  visits: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
};

type DashboardCreative = {
  id: string;
  name?: string;
  visits: number;
  conversions: number;
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
  cpa: number; // CostPerSignup
  cpr: number; // CPR
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

type DateRangeKey = "today" | "yesterday" | "last7days";

/**
 * Helpers to fetch zones (V1: zoneid) and creatives (V2: bannerid)
 * for a single campaign.
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
      "customVariable1",
      "customVariable4",
      "customVariable2",
    ];

    columns.forEach((c) => params.append("column", c));

    // Filter to a single campaign (matches your URL: filter1=campaign&filter1Value=...)
    params.append("filter1", "campaign");
    params.append("filter1Value", campaignId);

    const url = `${base.replace(/\/$/, "")}/report?${params.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "cwauth-token": token,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse errors
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
      revenue: Number(row.revenue ?? 0),
      cost: Number(row.cost ?? 0),
      roi: Number(row.roi ?? 0),
    }));
  } catch (err) {
    console.error("[Voluum] fetchZonesForCampaign error:", err);
    return [];
  }
}

async function fetchCreativesForCampaign(
  base: string,
  token: string,
  fromIso: string,
  toIso: string,
  campaignId: string
): Promise<DashboardCreative[]> {
  try {
    // We mirror the same pattern, but group by V2: bannerid (custom-variable-2)
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
      "customVariable2",
      "customVariable1",
      "customVariable4",
    ];

    columns.forEach((c) => params.append("column", c));

    params.append("filter1", "campaign");
    params.append("filter1Value", campaignId);

    const url = `${base.replace(/\/$/, "")}/report?${params.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "cwauth-token": token,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse errors
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
 * Main GET handler – campaigns + KPIs (+ zones/creatives for top campaigns)
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
  const dateRange =
    (searchParams.get("dateRange") as DateRangeKey | null) || "last7days";

  // Build from/to timestamps
  const to = new Date();
  to.setUTCMinutes(0, 0, 0);

  const from = new Date(to);

  if (dateRange === "today") {
    from.setUTCHours(0, 0, 0, 0);
  } else if (dateRange === "yesterday") {
    from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(from.getUTCDate());
    to.setUTCHours(23, 0, 0, 0);
  } else {
    // last 7 days
    from.setUTCDate(from.getUTCDate() - 7);
    from.setUTCHours(0, 0, 0, 0);
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // --- 1) Auth with Voluum ---
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

    // --- 2) Campaign-level report ---
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
    const maxDetailCampaigns = 10; // only fetch zones/creatives for first N campaigns

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

      if (index < maxDetailCampaigns) {
        [zones, creatives] = await Promise.all([
          fetchZonesForCampaign(base, token, fromIso, toIso, campaignId),
          fetchCreativesForCampaign(base, token, fromIso, toIso, campaignId),
        ]);
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

    // --- 3) KPIs ---
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

    const kpis: DashboardKpiCard[] = [
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
        value: `$${totals.revenue.toFixed(2)}`,
        delta: "–",
        positive: true,
      },
      {
        id: "profit",
        label: "Profit",
        value: `$${totals.profit.toFixed(2)}`,
        delta: "–",
        positive: totals.profit >= 0,
      },
      {
        id: "cpa",
        label: "CPA (per deposit)",
        value:
          depositCount > 0
            ? `$${cpaTotal.toFixed(2)}`
            : totalCost > 0
            ? "No deposits"
            : "$0.00",
        delta: "–",
        positive: cpaTotal > 0 ? cpaTotal < 1000000 : true,
      },
      {
        id: "cpr",
        label: "CPR (per signup)",
        value:
          signupCount > 0
            ? `$${cprTotal.toFixed(2)}`
            : totalCost > 0
            ? "No signups"
            : "$0.00",
        delta: "–",
        positive: cprTotal > 0 ? cprTotal < 1000000 : true,
      },
    ];

    return NextResponse.json(
      {
        dateRange,
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
