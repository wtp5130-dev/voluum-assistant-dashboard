// app/api/optimizer/apply/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/app/lib/permissions";
import { kv } from "@vercel/kv";

/**
 * Types
 */

type ZoneMetrics = {
  visits: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
};

type ZoneToPausePayload = {
  campaignId: string;
  zoneId: string;
  reason?: string;
  metrics?: ZoneMetrics;
};

type ApplyRequestBody = {
  zonesToPauseNow: ZoneToPausePayload[];
  dryRun?: boolean;
};

type ZoneApplyResult = {
  campaignId: string;
  zoneId: string;
  status: "success" | "failed" | "skipped";
  message: string;
  dryRun: boolean;
};

/** Resolve dashboard campaignId to provider campaign id using KV mapping when needed */
async function resolveProviderCampaignId(dashboardId: string): Promise<string> {
  // If already numeric, assume it's a provider id
  if (/^\d+$/.test(dashboardId)) return dashboardId;
  try {
    const mapping = (await kv.get("mapping:dashboardToProvider")) as
      | Record<string, string>
      | null;
    if (mapping && mapping[dashboardId]) {
      return String(mapping[dashboardId]);
    }
  } catch {}
  return dashboardId; // fall back to original
}

/**
 * Helper – call PropellerAds API for a single zone
 *
 * NOTE:
 * - This is a scaffold based on PropellerAds v5 API style.
 * - You MUST verify the exact endpoint + payload in their docs and adjust.
 * - Uses env: PROPELLER_API_TOKEN
 */
async function pauseZoneInPropeller(
  zone: ZoneToPausePayload
): Promise<{ ok: boolean; message: string }> {
  const token = process.env.PROPELLER_API_TOKEN;

  if (!token) {
    return {
      ok: false,
      message:
        "Missing PROPELLER_API_TOKEN env. Skipping real API call, behaving as dry-run.",
    };
  }

  // Build provider URL using configurable path (matches sync route)
  let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
  // Prefer an explicit add/blacklist path for POST operations; fall back to the GET path
  const pathTmpl = process.env.PROPELLER_ADD_BLACKLIST_PATH || process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zone";
  // Ensure we call provider with provider campaign id
  const providerCid = await resolveProviderCampaignId(zone.campaignId);
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(providerCid));
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const url = `${baseUrl}${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        // Adjust to whatever Propeller expects, e.g. ["12345"]
        zone_ids: [zone.zoneId],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        message: `Propeller API error (${res.status}): ${text || res.statusText}`,
      };
    }

    return { ok: true, message: "Zone blacklisted via Propeller API." };
  } catch (err: any) {
    console.error("Propeller API call failed:", err);
    return {
      ok: false,
      message: `Propeller API call failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * POST /api/optimizer/apply
 *
 * Body:
 * {
 *   zonesToPauseNow: [
 *     { campaignId, zoneId, reason?, metrics? }
 *   ],
 *   dryRun?: boolean   // default true if not provided
 * }
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as ApplyRequestBody | null;

    if (!body || !Array.isArray(body.zonesToPauseNow)) {
      return new Response(
        JSON.stringify({
          error: "Invalid body. Expected { zonesToPauseNow: Zone[], dryRun?: boolean }",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { zonesToPauseNow } = body;
    const dryRun = body.dryRun ?? true;

    // Permission check: allow dry-run calls without auth, but require permission for real applies
    if (!dryRun) {
      const ok = await requirePermission("optimizer");
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (zonesToPauseNow.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          dryRun,
          totalZones: 0,
          results: [],
          message: "No zones provided to pause.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const results: ZoneApplyResult[] = [];

    for (const zone of zonesToPauseNow) {
      if (!zone.campaignId || !zone.zoneId) {
        results.push({
          campaignId: zone.campaignId || "",
          zoneId: zone.zoneId || "",
          status: "skipped",
          message: "Missing campaignId or zoneId.",
          dryRun,
        });
        continue;
      }

      if (dryRun) {
        results.push({
          campaignId: zone.campaignId,
          zoneId: zone.zoneId,
          status: "success",
          message: `Dry-run only. Would pause zone "${zone.zoneId}" in campaign "${zone.campaignId}".`,
          dryRun: true,
        });
        continue;
      }

      // Real API mode: attempt to pause via PropellerAds
      const apiResult = await pauseZoneInPropeller(zone);

      const entry = {
        campaignId: zone.campaignId,
        zoneId: zone.zoneId,
        status: apiResult.ok ? "success" : "failed",
        message: apiResult.message,
        dryRun: false,
      } as ZoneApplyResult;

      // Log to KV on success
      if (apiResult.ok) {
        try {
          const logItem = {
            id: crypto.randomUUID(),
            campaignId: zone.campaignId,
            zoneId: zone.zoneId,
            provider: "propellerads",
            reason: zone.reason || undefined,
            timestamp: new Date().toISOString(),
          };
          await kv.lpush("blacklist:zones", logItem);
          await kv.ltrim("blacklist:zones", 0, 999);
        } catch (e) {
          console.warn("KV log failed:", e);
        }
      }

      results.push({
        campaignId: zone.campaignId,
        zoneId: zone.zoneId,
        status: entry.status,
        message: entry.message,
        dryRun: entry.dryRun,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun,
        totalZones: zonesToPauseNow.length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    // Note: If needed, audit logging could be done before returning.
  } catch (err: any) {
    console.error("Optimizer apply error:", err);
    return new Response(
      JSON.stringify({
        error: "Optimizer apply error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
