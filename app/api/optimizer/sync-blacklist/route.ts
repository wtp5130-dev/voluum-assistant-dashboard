import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";

const LIST_KEY = "blacklist:zones";

async function fetchBlacklistedFromPropeller(campaignId: string): Promise<string[] | null> {
  const token = process.env.PROPELLER_API_TOKEN;
  if (!token) return null;
  const baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com/v5";
  const url = `${baseUrl}/adv/campaigns/${encodeURIComponent(campaignId)}/zones/blacklist`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const arr: any[] = (json?.zone_ids || json?.zones || json?.data || []) as any[];
    return (arr || []).map((z) => String(z));
  } catch {
    return null;
  }
}

function getBaseUrl(req: NextRequest): string {
  try {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || process.env.VERCEL_URL || "localhost:3000";
    return `${proto}://${host}`;
  } catch {
    return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  }
}

async function getCampaignIdsFromDashboard(req: NextRequest, dateRange: string): Promise<string[]> {
  try {
    const base = getBaseUrl(req);
    const res = await fetch(`${base}/api/voluum-dashboard?dateRange=${encodeURIComponent(dateRange)}`);
    if (!res.ok) return [];
    const json = await res.json();
    const ids: string[] = (json?.campaigns || []).map((c: any) => String(c.id)).filter(Boolean);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

async function runSync(req: NextRequest, campaignIds: string[] | undefined, dateRange: string) {

    const seenList = ((await kv.lrange(LIST_KEY, 0, -1)) as any[]) || [];
    const seenSet = new Set<string>(
      seenList.map((e: any) => `${String(e.campaignId)}:${String(e.zoneId)}`)
    );

    let ids = campaignIds && campaignIds.length > 0 ? campaignIds : await getCampaignIdsFromDashboard(req, dateRange);
    ids = Array.from(new Set(ids));

    const newEntries: any[] = [];
    const diagnostics: Array<{ campaignId: string; fetched: number | null }> = [];
    for (const cid of ids) {
      const zones = await fetchBlacklistedFromPropeller(String(cid));
      diagnostics.push({ campaignId: String(cid), fetched: zones ? zones.length : null });
      if (!zones) continue;
      for (const zid of zones) {
        const key = `${cid}:${zid}`;
        if (seenSet.has(key)) continue;
        seenSet.add(key);
        newEntries.push({
          id: crypto.randomUUID(),
          campaignId: String(cid),
          zoneId: String(zid),
          provider: "propellerads",
          timestamp: new Date().toISOString(),
          synced: true,
          verified: true,
          verifiedAt: new Date().toISOString(),
        });
      }
    }

    if (newEntries.length > 0) {
      const updated = [...seenList, ...newEntries];
      // rewrite list preserving order
      await kv.del(LIST_KEY);
      for (let i = updated.length - 1; i >= 0; i--) {
        await kv.lpush(LIST_KEY, updated[i]);
      }
    }

    return { ok: true, campaigns: ids.length, added: newEntries.length, diagnostics };
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const campaignIds: string[] | undefined = Array.isArray(body?.campaignIds)
      ? (body.campaignIds as string[])
      : undefined;
    const dateRange: string = (body?.dateRange as string) || "last7days";
    const result = await runSync(req, campaignIds, dateRange);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "sync_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get("dateRange") || "last7days";
    const ids = searchParams.getAll("campaignId");
    const result = await runSync(req, ids.length ? ids : undefined, dateRange);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "sync_error", message: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
