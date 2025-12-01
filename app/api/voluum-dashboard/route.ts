// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

type VoluumRow = {
  campaignName?: string;
  trafficSourceName?: string;
  visits?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  cost?: number;
  profit?: number;
  roi?: number;
};

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

  // --- 1) Date range handling (VERY SIMPLE) ---
  const { searchParams } = new URL(request.url);
  const dateRange = searchParams.get("dateRange") || "last7days";

  // Start from "now"
  const to = new Date();
  // ✅ round TO to the nearest hour (down)
  to.setUTCMinutes(0, 0, 0);

  const from = new Date(to); // copy

  if (dateRange === "today") {
    // from = today at 00:00
    from.setUTCHours(0, 0, 0, 0);
  } else if (dateRange === "yesterday") {
    // from = yesterday at 00:00, to = yesterday at 23:00 (approx)
    from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(from.getUTCDate());
    to.setUTCHours(23, 0, 0, 0);
  } else {
    // default: last 7 days (to current rounded hour)
    from.setUTCDate(from.getUTCDate() - 7);
    // also make sure minutes/seconds are 0
    from.setUTCMinutes(0, 0, 0);
  }

  const fromIso = from.toISOString(); // e.g. 2025-11-24T03:00:00.000Z
  const toIso = to.toISOString();     // e.g. 2025-12-01T03:00:00.000Z

  // --- 2) Get session token ---
  const authUrl = `${base}/auth/access/session`;

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

    // --- 3) Call /report grouped by campaign ---
    const reportUrl = `${base}/report?from=${encodeURIComponent(
      fromIso
    )}&to=${encodeURIComponent(
      toIso
    )}&tz=UTC&groupBy=campaign&columns=visits,clicks,conversions,revenue,cost,profit,roi,campaignName,trafficSourceName`;

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

    // --- 4) Map Voluum rows -> our simplified shape ---
    const rows: VoluumRow[] = reportJson.rows || reportJson.data || [];

    const campaigns = rows.map((row, index) => {
      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);
      const profit = Number(
        typeof row.profit === "number" ? row.profit : revenue - cost
      );
      const roi = Number(row.roi ?? (cost !== 0 ? (profit / cost) * 100 : 0));

      return {
        id: row.campaignName || `row-${index}`,
        name: row.campaignName || "Unknown campaign",
        trafficSource: row.trafficSourceName || "Unknown source",
        visits: Number(row.visits ?? row.clicks ?? 0),
        conversions: Number(row.conversions ?? 0),
        revenue,
        profit,
        roi,
      };
    });

    // --- 5) Build KPI summary ---
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.visits += c.visits;
        acc.conversions += c.conversions;
        acc.revenue += c.revenue;
        acc.profit += c.profit;
        return acc;
      },
      { visits: 0, conversions: 0, revenue: 0, profit: 0 }
    );

    const kpis = [
      {
        id: "clicks",
        label: "Visits",
        value: totals.visits.toLocaleString(),
        delta: "–",
        positive: true,
      },
      {
        id: "conversions",
        label: "Conversions",
        value: totals.conversions.toLocaleString(),
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
