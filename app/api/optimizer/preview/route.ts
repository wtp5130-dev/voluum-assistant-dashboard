// app/api/optimizer/preview/route.ts

import { NextRequest } from "next/server";
import { requirePermission } from "@/app/lib/permissions";

/**
 * Types – keep in sync with your DashboardData
 */

type Zone = {
  id: string;
  visits: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
};

type Campaign = {
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
  zones?: Zone[];
};

type KPI = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
};

type DashboardData = {
  dateRange: string;
  from: string;
  to: string;
  kpis: KPI[];
  campaigns: Campaign[];
};

type PreviewRequestBody = {
  dashboard: DashboardData;
  trafficSourceFilter?: string; // "all" or a specific traffic source
};

type ZonePreview = {
  trafficSource: string;
  campaignId: string;
  campaignName: string;
  zoneId: string;
  reason: string;
  metrics: {
    visits: number;
    conversions: number;
    revenue: number;
    cost: number;
    roi: number;
  };
};

type RulePreview = {
  name: string;
  scope: "zone";
  trafficSource: string | null;
  condition: string;
  suggestedThresholds: {
    minVisits: number | null;
    minCost: number | null;
    maxROI: number | null;
  };
  action: "pause_zone";
  appliesTo: string;
  rationale: string;
};

type PreviewResponse = {
  rules: RulePreview[];
  zonesToPauseNow: ZonePreview[];
  meta: {
    dateRange: string;
    from: string;
    to: string;
    trafficSourceFilter: string;
    totalCampaigns: number;
    totalZonesScanned: number;
    totalCost: number;
    totalRevenue: number;
    avgVisitCost: number;
    thresholds: {
      baseMinVisits: number;
      baseMinCost: number;
      hardRoiCut: number;
    };
    filteredOutBlacklisted?: number;
  };
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ok = await requirePermission("optimizer");
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const body = (await req.json()) as PreviewRequestBody | null;

    if (!body || !body.dashboard) {
      return new Response(
        JSON.stringify({
          error: "Missing 'dashboard' in request body",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { dashboard, trafficSourceFilter } = body;
    const { campaigns, from, to, dateRange } = dashboard;
    // Load KV client dynamically to avoid type issues in edge runtimes
    // @ts-ignore – types may not be available in this context
    const { kv } = await import("@vercel/kv");

    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      return new Response(
        JSON.stringify({
          rules: [],
          zonesToPauseNow: [],
          meta: {
            dateRange,
            from,
            to,
            trafficSourceFilter: trafficSourceFilter ?? "all",
            totalCampaigns: 0,
            totalZonesScanned: 0,
            totalCost: 0,
            totalRevenue: 0,
            avgVisitCost: 0,
            thresholds: {
              baseMinVisits: 0,
              baseMinCost: 0,
              hardRoiCut: -200,
            },
          },
        } satisfies PreviewResponse),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Filter campaigns by traffic source if needed
    const scopedCampaigns = campaigns.filter((c) => {
      if (!trafficSourceFilter || trafficSourceFilter === "all") return true;
      return c.trafficSource === trafficSourceFilter;
    });

    // Load blacklist from KV so we can exclude already blacklisted zones
    type BlItem = { id?: string; campaignId: string; zoneId: string };
    const blItems = ((await kv.lrange("blacklist:zones", 0, -1)) as BlItem[]) || [];
    const blacklisted = new Set<string>();
    for (const it of blItems) {
      if (!it || !it.campaignId || !it.zoneId) continue;
      blacklisted.add(`${String(it.campaignId)}__${String(it.zoneId)}`);
    }
    // Load manual mappings to resolve provider IDs for comparison
    const mappings = (await kv.get("mapping:dashboardToProvider")) as
      | Record<string, string>
      | null;
    function resolveProviderCampaignId(dashboardId: string, campaignName?: string): string {
      if (/^\d+$/.test(dashboardId)) return dashboardId;
      if (mappings && mappings[dashboardId]) return String(mappings[dashboardId]);
      if (campaignName && mappings && mappings[campaignName]) return String(mappings[campaignName]);
      if (campaignName) {
        const m = campaignName.match(/(?:^|[^0-9])(\d{6,})(?=$|[^0-9])/);
        if (m && m[1]) return m[1];
      }
      return dashboardId;
    }

    // 2) Flatten zones + compute some global stats
    let totalVisits = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    const allZones: {
      campaign: Campaign;
      zone: Zone;
    }[] = [];

    for (const campaign of scopedCampaigns) {
      totalVisits += campaign.visits ?? 0;
      totalCost += campaign.cost ?? 0;
      totalRevenue += campaign.revenue ?? 0;

      const zones = campaign.zones ?? [];
      for (const z of zones) {
        const hasMetrics =
          (z.visits ?? 0) > 0 ||
          (z.conversions ?? 0) > 0 ||
          (z.cost ?? 0) > 0 ||
          (z.revenue ?? 0) > 0;
        const hasId = (z.id ?? "").trim().length > 0;

        if (hasMetrics || hasId) {
          allZones.push({ campaign, zone: z });
        }
      }
    }

    const avgVisitCost =
      totalVisits > 0 ? totalCost / totalVisits : 0;

    // 3) Dynamic but safe thresholds
    // - baseMinVisits ~ 50–150 depending on volume
    // - baseMinCost scales with your average CPC
    const baseMinVisits =
      totalVisits > 10000
        ? 150
        : totalVisits > 5000
        ? 100
        : totalVisits > 1000
        ? 70
        : 40;

    const baseMinCost = Math.max(
      0.5,
      avgVisitCost * 80 // roughly cost of ~80 average visits
    );

    // Hard ROI cut for zones that DO have revenue but are super negative
    const hardRoiCut = -200; // -200% and below

    const zonesToPauseNow: ZonePreview[] = [];
    let filteredOutBlacklisted = 0;

    // 4) Classify zones
    for (const { campaign, zone } of allZones) {
      const visits = zone.visits ?? 0;
      const conversions = zone.conversions ?? 0;
      const cost = zone.cost ?? 0;
      const revenue = zone.revenue ?? 0;
      const roi = zone.roi ?? 0;
      const zoneId = zone.id?.toString() || "unknown";

      // Exclude if already blacklisted (match using both dashboard and provider IDs)
      const dashKey = `${campaign.id}__${zoneId}`;
      const provKey = `${resolveProviderCampaignId(campaign.id, campaign.name)}__${zoneId}`;
      if (blacklisted.has(dashKey) || blacklisted.has(provKey)) {
        filteredOutBlacklisted++;
        continue;
      }

      const hasRevenue = revenue > 0; // deposit-aware: revenue means at least one FTD
      const hasTraffic = visits >= baseMinVisits || cost >= baseMinCost;

      if (!hasTraffic) {
        // Not enough data – do NOT pause
        continue;
      }

      // Case A: HARD LOSER – no deposits, enough spend, strongly negative ROI
      if (!hasRevenue && cost >= baseMinCost && roi <= -80) {
        zonesToPauseNow.push({
          trafficSource: campaign.trafficSource,
          campaignId: campaign.id,
          campaignName: campaign.name,
          zoneId,
          reason:
            "No deposits (revenue = 0) after sufficient traffic and spend, ROI ≤ -80%",
          metrics: {
            visits,
            conversions,
            revenue,
            cost,
            roi,
          },
        });
        continue;
      }

      // Case B: HAS DEPOSITS but is EXTREMELY negative ROI
      // We keep this VERY conservative, to avoid killing pockets that might still back out.
      if (
        hasRevenue &&
        cost >= baseMinCost * 3 &&
        roi <= hardRoiCut
      ) {
        zonesToPauseNow.push({
          trafficSource: campaign.trafficSource,
          campaignId: campaign.id,
          campaignName: campaign.name,
          zoneId,
          reason:
            "Has deposits but is extremely negative ROI after heavy spend (safety cut).",
          metrics: {
            visits,
            conversions,
            revenue,
            cost,
            roi,
          },
        });
      }

      // Otherwise – either profitable, or still learning. Do not auto-pause.
    }

    // 5) Rules description (human-readable)
    const rules: RulePreview[] = [
      {
        name: "No-deposit burner zones",
        scope: "zone",
        trafficSource:
          trafficSourceFilter && trafficSourceFilter !== "all"
            ? trafficSourceFilter
            : null,
        condition:
          "IF zone has >= baseMinVisits visits AND cost >= baseMinCost AND revenue = 0 AND ROI ≤ -80%",
        suggestedThresholds: {
          minVisits: baseMinVisits,
          minCost: parseFloat(baseMinCost.toFixed(2)),
          maxROI: -80,
        },
        action: "pause_zone",
        appliesTo:
          trafficSourceFilter && trafficSourceFilter !== "all"
            ? `All zones for traffic source '${trafficSourceFilter}' in the current date range`
            : "All zones in the current date range and view",
        rationale:
          "Zones that have burned enough budget without generating any deposits are very unlikely to back out. This rule aggressively trims pure burners while protecting zones that have at least one FTD.",
      },
      {
        name: "Heavy-loss zones with deposits (safety cut)",
        scope: "zone",
        trafficSource:
          trafficSourceFilter && trafficSourceFilter !== "all"
            ? trafficSourceFilter
            : null,
        condition:
          "IF zone has revenue > 0 AND cost ≥ (baseMinCost × 3) AND ROI ≤ hardRoiCut",
        suggestedThresholds: {
          minVisits: null,
          minCost: parseFloat((baseMinCost * 3).toFixed(2)),
          maxROI: hardRoiCut,
        },
        action: "pause_zone",
        appliesTo:
          trafficSourceFilter && trafficSourceFilter !== "all"
            ? `All zones for traffic source '${trafficSourceFilter}' in the current date range`
            : "All zones in the current date range and view",
        rationale:
          "Even zones with deposits can become unprofitable if they continue to burn far beyond their generated revenue. This rule is a safety brake for extreme negative ROI pockets while still being conservative.",
      },
    ];

    const response: PreviewResponse = {
      rules,
      zonesToPauseNow,
      meta: {
        dateRange,
        from,
        to,
        trafficSourceFilter: trafficSourceFilter ?? "all",
        totalCampaigns: scopedCampaigns.length,
        totalZonesScanned: allZones.length,
        totalCost: parseFloat(totalCost.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        avgVisitCost: parseFloat(avgVisitCost.toFixed(4)),
        thresholds: {
          baseMinVisits,
          baseMinCost: parseFloat(baseMinCost.toFixed(2)),
          hardRoiCut,
        },
        filteredOutBlacklisted,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("optimizer/preview error:", err);
    return new Response(
      JSON.stringify({
        error: "optimizer_preview_error",
        message: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
