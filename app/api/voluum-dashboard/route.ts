// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

/**
 * Types for zones, creatives and campaigns
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
  cpa: number; // Cost per signup (from Voluum column CostPerSignup)
  cpr: number; // Cost per registration (from Voluum column CPR)

  // Zone & creative stats – currently filled as [] until helper functions are wired.
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
 * ⚠️ IMPORTANT ABOUT ZONES & CREATIVES
 *
 * Voluum does not have a single universal way to store zone IDs and creative IDs.
 * Most people map them to custom variables (var1, var2, etc) when setting up the traffic source.
 *
 * The helper functions below are READY to call Voluum, but you (or a dev) must
 * fill in the exact query parameters from your own Voluum panel:
 *
 * - Run a zone report for a single campaign in Voluum UI.
 * - Open DevTools → Network → find the /report call → copy the query string.
 * - Paste the relevant groupBy / column names into the TODO sections.
 *
 * Until then, these helpers simply return [] so nothing breaks.
 */

async function fetchZonesForCampaign(
  base: string,
  token: string,
  fromIso: string,
  toIso: string,
  campaignId: string
): Promise<DashboardZone[]> {
  try {
    // TODO (DEV NEEDED):
    // 1. In Voluum, open a SPECIFIC report for one campaign.
    // 2. Group by the dimension that represents your zone ID (often a custom variable).
    // 3. Copy the /report?... URL from DevTools.
    // 4. Adjust groupBy + columns below to match what you see.

    const params = new URLSearchParams({
      reportType: "table",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      // EXAMPLE ONLY – these MUST be checked against your real Voluum request:
      // groupBy: "customVariable1", // e.g. if var1 == zoneId
      conversionTimeMode: "CONVERSION",
      limit: "200",
      offset: "0",
      sort: "visits",
      direction: "DESC",
      tz: "Asia/Singapore",
    });

    // Example columns – REPLACE with the ones from your DevTools /report URL:
    // const columns = ["customVariable1", "visits", "conversions", "revenue", "cost", "roi"];
    const columns: string[] = [];

    columns.forEach((c) => params.append("column", c));

    // ⚠️ Filtering by campaign:
    // Voluum uses slightly different ways to filter in /report.
    // Look at your DevTools URL – copy whatever params it uses to limit to one campaign.
    //
    // Example pattern (you MUST verify and adjust or remove if not present):
    // params.append("filter1", "campaign");
    // params.append("filter1in", campaignId);

    // If you haven't filled any columns / filters yet, just short-circuit:
    if (columns.length === 0) {
      console.warn(
        "[Voluum dashboard] fetchZonesForCampaign: columns not configured yet, returning empty zones[]"
      );
      return [];
    }

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
      // ignore
    }

    if (!res.ok || !json?.rows) {
      console.warn(
        "[Voluum dashboard] fetchZonesForCampaign failed",
        res.status,
        text
      );
      return [];
    }

    return (json.rows as any[]).map((row) => ({
      id: String(
        // replace "customVariable1" with whatever contains zone ID in your account
        row.customVariable1 ?? row.zone ?? "unknown"
      ),
      visits: Number(row.visits ?? 0),
      conversions: Number(row.conversions ?? 0),
      revenue: Number(row.revenue ?? 0),
      cost: Number(row.cost ?? 0),
      roi: Number(row.roi ?? 0),
    }));
  } catch (err) {
    console.error(
      "[Voluum dashboard] fetchZonesForCampaign error (zones will be empty):",
      err
    );
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
    // TODO (DEV NEEDED):
    // 1. In Voluum, open a SPECIFIC report for the same campaign.
    // 2. Group by the dimension that represents your creative (ID or name).
    // 3. Copy the /report?... URL from DevTools.
    // 4. Adjust groupBy + columns below to match it.

    const params = new URLSearchParams({
      reportType: "table",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      // EXAMPLE ONLY – MUST be verified:
      // groupBy: "customVariable2", // e.g. if var2 == creativeId or creativeName
      conversionTimeMode: "CONVERSION",
      limit: "200",
      offset: "0",
      sort: "visits",
      direction: "DESC",
      tz: "Asia/Singapore",
    });

    // Example columns – REPLACE with the ones from your DevTools /report URL:
    // const columns = ["customVariable2", "visits", "conversions", "revenue", "cost", "roi"];
    const columns: string[] = [];

    columns.forEach((c) => params.append("column", c));

    // Example campaign filter (MUST be checked/adjusted or removed):
    // params.append("filter1", "campaign");
    // params.append("filter1in", campaignId);

    if (columns.length === 0) {
      console.warn(
        "[Voluum dashboard] fetchCreativesForCampaign: columns not configured yet, returning empty creatives[]"
      );
      return [];
    }

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
      // ignore
    }

    if (!res.ok || !json?.rows) {
      console.warn(
        "[Voluum dashboard] fetchCreativesForCampaign failed",
        res.status,
        text
      );
      return [];
    }

    return (json.rows as any[]).map((row) => ({
      id: String(
        // replace "customVariable2" with whatever contains creative ID in your account
        row.customVariable2 ?? row.creative ?? "unknown"
      ),
      // If you also have separate creativeName column, map it here:
      name: row.creativeName,
      visits: Number(row.visits ?? 0),
      conversions: Number(row.conversions ?? 0),
      revenue: Number(row.revenue ?? 0),
      cost: Number(row.cost ?? 0),
      roi: Number(row.roi ?? 0),
    }));
  } catch (err) {
    console.error(
      "[Voluum dashboard] fetchCreativesForCampaign error (creatives will be empty):",
      err
    );
    return [];
  }
}

/**
 * Main GET handler: returns campaigns + KPIs
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

  // End time = now rounded to the hour (UTC)
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

  // --- 1) Auth: get cwauth-token from Voluum ---
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

    // --- 2) Campaign-level report (/report?groupBy=campaign) ---
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

    // Limit how many campaigns we fetch extra data for (zones/creatives),
    // to avoid hitting Voluum rate limits.
    const maxDetailCampaigns = 10;

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

      // For the first N campaigns, try to fetch zones/creatives.
      // If the helper functions are not yet configured, they will just return [].
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

    // --- 3) Aggregate KPIs from all campaigns ---
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
