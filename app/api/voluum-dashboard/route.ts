// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

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
};

type DateRangeKey = "today" | "yesterday" | "last7days";

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

  // --- 1) Date range handling (same presets as UI) ---
  const { searchParams } = new URL(request.url);
  const dateRange =
    (searchParams.get("dateRange") as DateRangeKey | null) || "last7days";

  // End time = now, rounded down to the hour
  const to = new Date();
  to.setUTCMinutes(0, 0, 0);

  const from = new Date(to); // copy base

  if (dateRange === "today") {
    // today 00:00 -> now
    from.setUTCHours(0, 0, 0, 0);
  } else if (dateRange === "yesterday") {
    // yesterday 00:00 -> yesterday 23:00
    from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(from.getUTCDate());
    to.setUTCHours(23, 0, 0, 0);
  } else {
    // default: last 7 days (to current rounded hour)
    from.setUTCDate(from.getUTCDate() - 7);
    from.setUTCMinutes(0, 0, 0);
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // --- 2) Get session token (same as before) ---
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

    // --- 3) Build /report URL with the same style as your panel ---
    // We mimic:
    //  reportType=table
    //  dateRange=custom-date-time
    //  groupBy=campaign
    //  conversionTimeMode=CONVERSION
    //  column=... (multiple times)
    const params = new URLSearchParams({
      reportType: "table",
      limit: "100",
      dateRange: "custom-date-time",
      from: fromIso,
      to: toIso,
      searchMode: "TEXT",
      offset: "0",
      include: "ACTIVE",
      // currency isn't strictly needed to get values, but harmless:
      currency: "MYR",
      sort: "visits",
      direction: "DESC",
      groupBy: "campaign",
      conversionTimeMode: "CONVERSION",
      tz: "Asia/Singapore",
    });

    const columns = [
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
      "campaignName",
      "trafficSourceName",
      "costSources",
      "cost",
      "visits",
      "conversions",
      "roi",
      "revenue",
      "clicks",
    ];

    columns.forEach((col) => params.append("column", col));

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
      // ignore parse errors
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

    // --- 4) Map rows => our campaign shape ---
    const rows: any[] = reportJson.rows || reportJson.data || [];

    const campaigns: DashboardCampaign[] = rows.map((row, index) => {
      const visits = Number(row.visits ?? 0);
      const conversions = Number(row.conversions ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);

      // Profit / ROI
      const profit = Number(
        typeof row.profit === "number" ? row.profit : revenue - cost
      );
      const roi = Number(row.roi ?? (cost !== 0 ? (profit / cost) * 100 : 0));

      // Custom conversions:
      //  - Assume customConversions1 = signups
      //  - Assume customConversions2 = deposits / FTD
      const signups = Number(row.customConversions1 ?? 0);
      const deposits = Number(row.customConversions2 ?? 0);

      // CPA / CPR directly from Voluum columns if present
      const cpa = Number(row.CostPerSignup ?? 0);
      const cpr = Number(row.CPR ?? 0);

      return {
        id: row.campaignName || `row-${index}`,
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
      };
    });

    // --- 5) Build KPI summary from campaigns ---
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

    const kpis = [
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
