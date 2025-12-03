// app/api/optimizer/preview/route.ts
import { NextResponse } from "next/server";

/**
 * Types – keep in sync with your frontend DashboardData
 */
type KPI = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
};

type Zone = {
  id: string;
  visits: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
};

type Creative = {
  id: string;
  name?: string | null;
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
  creatives?: Creative[];
};

type DashboardData = {
  dateRange: string;
  from: string;
  to: string;
  kpis: KPI[];
  campaigns: Campaign[];
};

/**
 * Suggestions types
 */
type RuleSuggestion = {
  name: string;
  scope: "zone";
  trafficSource: string | null;
  country: string | null;
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

type ZonePauseSuggestion = {
  campaignId: string;
  campaignName: string;
  trafficSource: string;
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

type PreviewResponse = {
  rules: RuleSuggestion[];
  zonesToPauseNow: ZonePauseSuggestion[];
  meta: {
    targetCPA: number | null;
    minVisits: number;
    minCost: number;
    maxROI: number;
    totalCampaigns: number;
    totalZonesConsidered: number;
    trafficSourceFilter: string | "all";
  };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const dashboard: DashboardData | undefined = body.dashboard;
    const trafficSourceFilter: string | "all" =
      body.trafficSourceFilter ?? "all";

    if (!dashboard || !dashboard.campaigns) {
      return NextResponse.json(
        { error: "Missing 'dashboard' with campaigns[]" },
        { status: 400 }
      );
    }

    // 1) Filter campaigns by traffic source if needed
    const campaigns = dashboard.campaigns.filter((c) => {
      if (trafficSourceFilter === "all") return true;
      return c.trafficSource === trafficSourceFilter;
    });

    if (campaigns.length === 0) {
      const empty: PreviewResponse = {
        rules: [],
        zonesToPauseNow: [],
        meta: {
          targetCPA: null,
          minVisits: 100,
          minCost: 10,
          maxROI: -80,
          totalCampaigns: 0,
          totalZonesConsidered: 0,
          trafficSourceFilter,
        },
      };
      return NextResponse.json(empty);
    }

    // 2) Compute a "target CPA" based on campaigns that actually have deposits
    let totalCostWithDeps = 0;
    let totalDeposits = 0;
    let totalCostAll = 0;
    let totalVisitsAll = 0;

    for (const c of campaigns) {
      totalCostAll += c.cost ?? 0;
      totalVisitsAll += c.visits ?? 0;

      if ((c.deposits ?? 0) > 0) {
        totalCostWithDeps += c.cost ?? 0;
        totalDeposits += c.deposits ?? 0;
      }
    }

    let targetCPA: number | null = null;
    if (totalDeposits > 0) {
      targetCPA = totalCostWithDeps / totalDeposits;
    } else if (totalCostAll > 0 && totalVisitsAll > 0) {
      // Fallback: cost per visit * 100 as a rough "test budget" per zone
      const avgCPC = totalCostAll / totalVisitsAll;
      targetCPA = avgCPC * 100;
    }

    // 3) Derive conservative thresholds from data
    //    You can tweak these numbers later.
    const minVisits = 150; // require at least 150 visits
    const minCost =
      targetCPA && targetCPA > 0 ? targetCPA * 0.4 : 10; // 40% of CPA or $10
    const maxROI = -80; // <= -80% ROI is considered "bad"

    const zonesToPauseNow: ZonePauseSuggestion[] = [];
    let totalZonesConsidered = 0;

    for (const campaign of campaigns) {
      const zones = campaign.zones ?? [];
      for (const z of zones) {
        totalZonesConsidered += 1;

        const visits = z.visits ?? 0;
        const conv = z.conversions ?? 0;
        const cost = z.cost ?? 0;
        const rev = z.revenue ?? 0;
        const roi = z.roi ?? 0;

        // Skip zones with literally no spend or traffic
        if (visits === 0 && cost === 0 && rev === 0 && conv === 0) continue;

        // Rule logic:
        // A) Strong candidate: enough visits AND 0 conversions AND cost >= minCost
        const isZeroConvBurner =
          visits >= minVisits && conv === 0 && cost >= minCost;

        // B) Also consider zones with conversions but very bad ROI and big spend
        const isNegativeROIBurner =
          conv > 0 && cost >= (targetCPA ?? 20) && roi <= maxROI;

        if (isZeroConvBurner || isNegativeROIBurner) {
          const reasonParts: string[] = [];

          if (isZeroConvBurner) {
            reasonParts.push(
              `≥ ${minVisits} visits, 0 conversions, cost ${cost.toFixed(2)}`
            );
          }
          if (isNegativeROIBurner) {
            reasonParts.push(
              `has conversions but ROI ${roi.toFixed(
                2
              )}% at cost ${cost.toFixed(2)}`
            );
          }

          zonesToPauseNow.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            trafficSource: campaign.trafficSource,
            zoneId: z.id || "(empty-id)",
            reason: reasonParts.join(" + "),
            metrics: {
              visits,
              conversions: conv,
              revenue: rev,
              cost,
              roi,
            },
          });
        }
      }
    }

    // 4) Build rule suggestions (metadata for your UI)
    const rules: RuleSuggestion[] = [
      {
        name: "Zero-conversion zone killer",
        scope: "zone",
        trafficSource: trafficSourceFilter === "all" ? null : trafficSourceFilter,
        country: null,
        condition: `IF zone has ≥ ${minVisits} visits, 0 conversions AND cost ≥ ${minCost.toFixed(
          2
        )}`,
        suggestedThresholds: {
          minVisits,
          minCost,
          maxROI: null,
        },
        action: "pause_zone",
        appliesTo:
          trafficSourceFilter === "all"
            ? "all zones in all traffic sources (current dashboard view)"
            : `all zones in traffic source "${trafficSourceFilter}" (current dashboard view)`,
        rationale:
          "These zones spent a meaningful budget and never converted in this date range. Pausing them typically removes clear waste.",
      },
    ];

    // Add a negative-ROI rule only if we actually have a target CPA
    if (targetCPA && targetCPA > 0) {
      rules.push({
        name: "Negative ROI zone protection",
        scope: "zone",
        trafficSource:
          trafficSourceFilter === "all" ? null : trafficSourceFilter,
        country: null,
        condition: `IF zone cost ≥ ${targetCPA.toFixed(
          2
        )} AND ROI ≤ ${maxROI}%`,
        suggestedThresholds: {
          minVisits: null,
          minCost: targetCPA,
          maxROI,
        },
        action: "pause_zone",
        appliesTo:
          trafficSourceFilter === "all"
            ? "all zones with enough spend in all traffic sources"
            : `zones with enough spend in traffic source "${trafficSourceFilter}"`,
        rationale:
          "Zones that already spent around a full target CPA and still sit at very negative ROI are unlikely to recover, so it's safer to pause them.",
      });
    }

    const response: PreviewResponse = {
      rules,
      zonesToPauseNow,
      meta: {
        targetCPA: targetCPA ?? null,
        minVisits,
        minCost,
        maxROI,
        totalCampaigns: campaigns.length,
        totalZonesConsidered,
        trafficSourceFilter,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    console.error("optimizer/preview error:", err);
    return NextResponse.json(
      {
        error: "optimizer_preview_error",
        message: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
