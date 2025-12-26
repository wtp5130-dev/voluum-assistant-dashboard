// app/api/voluum/report/route.ts
import { NextResponse } from "next/server";

type DateRangeKey =
  | "today"
  | "yesterday"
  | "last3days"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "custom"
  | "custom-date-time";

function normalizeDateParam(val: string | null, endOfDay: boolean): Date | null {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const t = "T00:00:00.000Z";
    const d = new Date(val + t);
    if (isNaN(d.getTime())) return null;
    // Voluum requires times rounded to the hour; for end-of-day, use midnight of next day
    if (endOfDay) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const base = process.env.VOLUUM_API_BASE;
    const accessId = process.env.VOLUUM_ACCESS_ID;
    const accessKey = process.env.VOLUUM_ACCESS_KEY;

    if (!base || !accessId || !accessKey) {
      return NextResponse.json(
        { error: "Missing Voluum credentials. Check .env.local." },
        { status: 500 }
      );
    }

  const { searchParams } = new URL(req.url);
  const rawRange = (searchParams.get("dateRange") as DateRangeKey | null) || null;
  const dateRange: DateRangeKey = (rawRange === "custom-date-time" ? "custom" : rawRange) || "last7days";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const groupBy = (searchParams.get("groupBy") || "campaign").toLowerCase(); // campaign|day|country|traffic-source
  const tz = searchParams.get("tz") || "Asia/Singapore";
  const currency = searchParams.get("currency") || "MYR";
  const limit = searchParams.get("limit") || (groupBy === "day" ? "500" : "200");
  const campaignIdsCsv = (searchParams.get("campaignIds") || "").trim();
  const campaignIds = campaignIdsCsv ? campaignIdsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
  const debug = searchParams.get("debug") === "1";

  // Resolve from/to
  let to = normalizeDateParam(toParam, true) || new Date();
  if (!toParam) to.setUTCMinutes(0, 0, 0);
  let from = normalizeDateParam(fromParam, false) || new Date(to);
  if (!fromParam || dateRange !== "custom") {
    if (dateRange === "today") {
      from = new Date(to); from.setUTCHours(0, 0, 0, 0);
    } else if (dateRange === "yesterday") {
      from = new Date(to); from.setUTCDate(from.getUTCDate() - 1); from.setUTCHours(0, 0, 0, 0);
      to = new Date(from); to.setUTCDate(to.getUTCDate() + 1); to.setUTCHours(0, 0, 0, 0);
    } else if (dateRange === "last30days") {
      from = new Date(to); from.setUTCDate(from.getUTCDate() - 30); from.setUTCHours(0, 0, 0, 0);
    } else if (dateRange === "last7days") {
      from = new Date(to); from.setUTCDate(from.getUTCDate() - 7); from.setUTCHours(0, 0, 0, 0);
    } else if (dateRange === "last3days") {
      from = new Date(to); from.setUTCDate(from.getUTCDate() - 3); from.setUTCHours(0, 0, 0, 0);
    } else if (dateRange === "thismonth") {
      from = new Date(to); from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    }
  }
  if (from.getTime() > to.getTime()) { const tmp = from; from = to; to = tmp; }
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // 1) Auth
  const authUrl = `${base.replace(/\/$/, "")}/auth/access/session`;
  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ accessId, accessKey }),
  });
  const authJson = await authRes.json().catch(() => null as any);
  if (!authRes.ok || !authJson?.token) {
    return NextResponse.json(
      { error: "Failed to authenticate with Voluum", status: authRes.status, body: authJson },
      { status: 500 }
    );
  }
  const token = authJson.token as string;

  // 2) Build report query
  const params = new URLSearchParams({
    reportType: "table",
    limit,
    dateRange: "custom-date-time",
    from: fromIso,
    to: toIso,
    searchMode: "TEXT",
    offset: "0",
    currency,
    include: "ACTIVE",
    sort: "visits",
    direction: groupBy === "day" ? "ASC" : "DESC",
    groupBy,
    conversionTimeMode: "CONVERSION",
    tz,
  });

  const columns = [
    "campaignId",
    "campaignName",
    "trafficSourceName",
    groupBy === "country" ? "country" : undefined,
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
    groupBy === "day" ? "day" : undefined,
  ].filter(Boolean) as string[];
  columns.forEach((c) => params.append("column", c));

  const url = `${base.replace(/\/$/, "")}/report?${params.toString()}`;
  const res = await fetch(url, { method: "GET", headers: { "cwauth-token": token, Accept: "application/json" } });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok || !json) {
    return NextResponse.json(
      { error: "Voluum /report failed", status: res.status, body: json || text, reportCalledUrl: url, params: Object.fromEntries(params.entries()) },
      { status: 500 }
    );
  }

  let rows: any[] = (json.rows || json.data || []) as any[];
  if (campaignIds.length > 0) {
    rows = rows.filter((r) => campaignIds.includes(String(r.campaignId || r.campaignName || "")));
  }

  const payload: any = {
    dateRange,
    from: fromIso,
    to: toIso,
    groupBy,
    tz,
    currency,
    count: rows.length,
    rows,
  };
  if (debug) payload.reportCalledUrl = url;
  return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[voluum/report] Unhandled error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err?.message || String(err),
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
