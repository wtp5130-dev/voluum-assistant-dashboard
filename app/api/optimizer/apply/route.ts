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
  providerCampaignId?: string;
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
async function resolveProviderCampaignId(dashboardId: string, campaignName?: string): Promise<string> {
  // If already numeric, assume it's a provider id
  if (/^\d+$/.test(dashboardId)) return dashboardId;
  try {
    const mapping = (await kv.get("mapping:dashboardToProvider")) as
      | Record<string, string>
      | null;
    if (mapping && mapping[dashboardId]) {
      return String(mapping[dashboardId]);
    }
    if (campaignName && mapping && mapping[campaignName]) {
      return String(mapping[campaignName]);
    }
  } catch {}
  // Try to extract a long numeric token from the name (common pattern)
  if (campaignName) {
    const m = campaignName.match(/(?:^|[^0-9])(\d{6,})(?=$|[^0-9])/);
    if (m && m[1]) return m[1];
  }
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
async function fetchProviderCampaignIdByName(name?: string): Promise<string | null> {
  try {
    const token = process.env.PROPELLER_API_TOKEN;
    if (!token || !name) return null;
    let baseUrl = process.env.PROPELLER_API_BASE_URL || "https://ssp-api.propellerads.com";
    let path = process.env.PROPELLER_LIST_CAMPAIGNS_PATH || "/v5/adv/campaigns";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) path = path.replace(/^\/v\d+/, "");
    if (!path.startsWith("/")) path = `/${path}`;
    const url = `${baseUrl}${path}?search=${encodeURIComponent(name)}`;
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const txt = await res.text();
    let js: any = null; try { js = txt ? JSON.parse(txt) : null; } catch {}
    const items: any[] = js?.data || js?.items || js?.campaigns || [];
    const first = Array.isArray(items) && items.length > 0 ? items[0] : null;
    const id = first?.id ?? first?.campaign_id ?? first?.campaignId;
    return id ? String(id) : null;
  } catch { return null; }
}

async function pauseZoneInPropeller(zone: ZoneToPausePayload): Promise<{ ok: boolean; message: string }> {
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
  // Default to plural "zones" path; can be overridden via env
  const pathTmpl = process.env.PROPELLER_ADD_BLACKLIST_PATH || process.env.PROPELLER_GET_BLACKLIST_PATH || "/v5/adv/campaigns/{campaignId}/targeting/exclude/zones";
  // Ensure we call provider with provider campaign id
  let providerCid = (zone as any).providerCampaignId as string | undefined;
  if (!providerCid) {
    providerCid = await resolveProviderCampaignId(zone.campaignId, (zone as any).campaignName);
  }
  if (!/^\d+$/.test(providerCid)) {
    // Attempt live lookup by campaign name
    const byName = await fetchProviderCampaignIdByName((zone as any).campaignName);
    if (byName) providerCid = byName;
  }
  let path = pathTmpl.replace("{campaignId}", encodeURIComponent(providerCid));
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.match(/\/v\d+(?:$|\/)/) && path.match(/^\/v\d+\//)) {
    path = path.replace(/^\/v\d+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const urlBase = `${baseUrl}${path}`;

  try {
    const key = process.env.PROPELLER_ADD_ZONE_KEY || "zone_ids";
    const template = process.env.PROPELLER_ADD_BLACKLIST_BODY_TEMPLATE; // JSON string with {zoneId} and {campaignId}
    const basePayload: Record<string, any> = { [key]: [zone.zoneId] };
    const scalarPayload: Record<string, any> = { [key]: zone.zoneId };
    const payloads: Array<Record<string, any>> = [];
    // 1) Template payload (highest priority if provided)
    if (template) {
      try {
        const filled = template
          .replaceAll("{zoneId}", String(zone.zoneId))
          .replaceAll("{campaignId}", String(providerCid));
        const parsed = JSON.parse(filled);
        payloads.push(parsed);
      } catch {}
    }
    // 2) Common variants
    payloads.push(basePayload);
    payloads.push(scalarPayload);
    payloads.push({ zone: [zone.zoneId] });
    payloads.push({ zones: [zone.zoneId] });
    payloads.push({ exclude: { zone: [zone.zoneId] } });
    payloads.push({ targeting: { exclude: { zone: [zone.zoneId] } } });

    const preferred = (process.env.PROPELLER_ADD_METHOD || "PATCH").toUpperCase();
    const tryOrder = preferred === "PUT" ? ["PUT", "PATCH"] : ["PATCH", "PUT"]; // fallback between PATCH/PUT
    const pathVariants = [
      urlBase,
      urlBase.replace(/\/exclude\/zone(\b|$)/, "/exclude/zones"),
      urlBase.replace(/\/exclude\/zones(\b|$)/, "/exclude/zone"),
      // legacy pattern some accounts expose
      urlBase.replace(/\/targeting\/exclude\/(?:zones?|zone)/, "/zones/blacklist"),
    ].filter((u, i, a) => a.indexOf(u) === i);

    let lastStatus = 0;
    let lastText = "";
    for (const method of tryOrder) {
      for (const candidate of pathVariants) {
        for (const p of payloads) {
          const res = await fetch(candidate, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(p),
        });
        if (res.ok) {
          return { ok: true, message: `Zone blacklisted via Propeller API (${method}).` };
        }
        lastStatus = res.status;
        lastText = await res.text();
        // If clearly method not allowed, try next method; if empty data, try next payload; otherwise stop
          if (res.status === 405) break; // switch method
          if (res.status === 404) continue; // try next route variant
          if (res.status === 400 && /Empty data/i.test(lastText)) {
            continue; // try next payload shape
          }
          // Other errors: stop trying payload variants for this route/method
          break;
        }
      }
      // If we got 405, loop will try the other method; otherwise we already tried variants, move on
    }

    return {
      ok: false,
      message: `Propeller API error (${lastStatus}): ${lastText || ""}`.trim(),
    };
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

    // Write audit entry to KV so Audit Trail shows blacklist operations
    try {
      const auditEntry = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        category: "optimizer",
        action: dryRun ? "blacklist_dryrun" : "blacklist_apply",
        items: results,
      };
      await kv.lpush("audit:events", auditEntry);
      await kv.ltrim("audit:events", 0, 999);
    } catch (e) {
      // non-fatal
      console.warn("[apply] failed to write audit entry", (e as any)?.message || String(e));
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
