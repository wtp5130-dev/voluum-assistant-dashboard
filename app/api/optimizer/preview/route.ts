// app/api/optimizer/preview/route.ts
import { NextRequest } from "next/server";

/**
 * Types mirrored from your frontend
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

type EnrichedZone = Zone & {
  campaignId: string;
  campaignName: string;
  trafficSource: string;
  campaignDeposits: number;
  campaignRevenue: number;
  campaignROI: number;
};

type RuleDefinition = {
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

type ZonePauseNow = {
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

/**
 * Helpers
 */

function safeNumber(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num) || !Number.isFinite(num)) return 0;
  return num;
}

function mean(values: number[]): number {
  const arr = values.filter((v) => Number.isFinite(v));
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(values: number[]): number {
  const arr = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  const len = arr.length;
  if (!len) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function percentile(values: number[], p: number): number {
  const arr = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (!arr.length) return 0;
  const rank = (p / 100) * (arr.length - 1);
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  if (lowIndex === highIndex) return arr[lowIndex];
  const weight = rank - lowIndex;
  return arr[lowIndex] * (1 - weight) + arr[highIndex] * weight;
}

/**
 * Main preview handler
 */

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonResponse(
        { error: "Invalid body. Expected JSON." },
        400
      );
    }

    const { dashboard, trafficSourceFilter } = body as {
      dashboard?: DashboardData;
      trafficSourceFilter?: string;
    };

    if (!dashboard || !dashboard.campaigns) {
      return jsonResponse(
        { error: "Missing 'dashboard' field with campaigns." },
        400
      );
    }

    const dateRange = dashboard.dateRange ?? "custom";
    const from = dashboard.from;
    const to = dashboard.to;

    // 1) Filter campaigns by trafficSourceFilter (same logic as frontend)
    const tsFilter = trafficSourceFilter && trafficSourceFilter !== "all"
      ? trafficSourceFilter
      : null;

    const campaigns: Campaign[] = dashboard.campaigns.filter((c) =>
      tsFilter ? c.trafficSource === tsFilter : true
    );

    if (!campaigns.length) {
      return jsonResponse({
        rules: [],
        zonesToPauseNow: [],
        meta: {
          generatedAt: new Date().toISOString(),
          dateRange,
          from,
          to,
          trafficSourceFilter: tsFilter,
          totalCampaigns: 0,
          totalZones: 0,
          totalZonesFlagged: 0,
          notes: [
            "No campaigns found for this traffic source filter.",
            "Try switching the traffic source in the dashboard and regenerate preview."
          ],
        },
      });
    }

    // 2) Flatten zones
    const allZones: EnrichedZone[] = [];
    for (const c of campaigns) {
      const zones = c.zones ?? [];
      for (const z of zones) {
        if (!z) continue;
        allZones.push({
          ...z,
          id: (z.id ?? "").toString(),
          visits: safeNumber(z.visits),
          conversions: safeNumber(z.conversions),
          revenue: safeNumber(z.revenue),
          cost: safeNumber(z.cost),
          roi: safeNumber(z.roi),
          campaignId: c.id,
          campaignName: c.name,
          trafficSource: c.trafficSource,
          campaignDeposits: safeNumber(c.deposits),
          campaignRevenue: safeNumber(c.revenue),
          campaignROI: safeNumber(c.roi),
        });
      }
    }

    if (!allZones.length) {
      return jsonResponse({
        rules: [],
        zonesToPauseNow: [],
        meta: {
          generatedAt: new Date().toISOString(),
          dateRange,
          from,
          to,
          trafficSourceFilter: tsFilter,
          totalCampaigns: campaigns.length,
          totalZones: 0,
          totalZonesFlagged: 0,
          notes: [
            "No zone-level data found in the current dashboard.",
            "Make sure your Voluum report includes zone/placement breakdown."
          ],
        },
      });
    }

    // 3) Compute global stats for adaptive thresholds
    const visitsArr = allZones.map((z) => z.visits);
    const costArr = allZones.map((z) => z.cost);
    const roiArr = allZones.map((z) => z.roi);

    const globalMedianVisits = median(visitsArr);
    const globalP75Visits = percentile(visitsArr, 75);
    const globalMedianCost = median(costArr);
    const globalP75Cost = percentile(costArr, 75);
    const globalMeanROI = mean(roiArr);

    // Conservative minima
    const minVisitsForDecision = Math.max(
      50,
      Math.round(globalMedianVisits || 0),
      Math.round(globalP75Visits * 0.5 || 0)
    );

    const minCostForDecision = Math.max(
      5,
      Math.round(globalMedianCost || 0),
      Math.round(globalP75Cost * 0.5 || 0)
    );

    // High-spend definition
    const highSpendNoConvCost = Math.max(
      minCostForDecision * 2,
      globalP75Cost || minCostForDecision * 2,
      10
    );

    // 4) Campaign-level ROI map (for outlier detection)
    const campaignStats = new Map<
      string,
      {
        avgROI: number;
        medianROI: number;
        medianCost: number;
      }
    >();

    for (const c of campaigns) {
      const zones = allZones.filter((z) => z.campaignId === c.id);
      if (!zones.length) continue;
      const rois = zones.map((z) => z.roi);
      const costs = zones.map((z) => z.cost);
      campaignStats.set(c.id, {
        avgROI: mean(rois),
        medianROI: median(rois),
        medianCost: median(costs),
      });
    }

    // 5) Build Pro-level rules definitions (what user sees)
    const rules: RuleDefinition[] = [];

    rules.push({
      name: "High-spend, zero-conversion zones",
      scope: "zone",
      trafficSource: tsFilter,
      country: null,
      condition:
        "IF zone has >= minVisits visits AND cost >= minCost AND conversions == 0 AND ROI <= maxROI",
      suggestedThresholds: {
        minVisits: minVisitsForDecision,
        minCost: highSpendNoConvCost,
        maxROI: -100,
      },
      action: "pause_zone",
      appliesTo:
        "All zones in the current dashboard view (filtered by traffic source & date range).",
      rationale:
        "These zones spend meaningful budget without producing conversions, and are likely pure burn. Thresholds auto-adjust to your traffic scale.",
    });

    rules.push({
      name: "Terrible-ROI zones (even with conversions)",
      scope: "zone",
      trafficSource: tsFilter,
      country: null,
      condition:
        "IF zone has >= minVisits visits AND cost >= minCost AND conversions > 0 AND ROI <= maxROI",
      suggestedThresholds: {
        minVisits: minVisitsForDecision,
        minCost: minCostForDecision,
        maxROI: -150,
      },
      action: "pause_zone",
      appliesTo:
        "Zones that technically convert but are heavily unprofitable in the current report.",
      rationale:
        "Some zones bring a few conversions but the CPA is so bad that they destroy ROI. This rule catches those extreme losers.",
    });

    rules.push({
      name: "Campaign outlier burn zones",
      scope: "zone",
      trafficSource: tsFilter,
      country: null,
      condition:
        "IF zone cost >= campaign median zone cost AND ROI is at least 80 percentage points lower than campaign average ROI.",
      suggestedThresholds: {
        minVisits: minVisitsForDecision,
        minCost: minCostForDecision,
        maxROI: null,
      },
      action: "pause_zone",
      appliesTo:
        "Zones that are much worse than siblings in the same campaign, even if the overall campaign is okay.",
      rationale:
        "Detects pockets inside a good campaign that quietly burn budget compared to the rest of the zones.",
    });

    rules.push({
      name: "Deposit-aware non-contributor zones",
      scope: "zone",
      trafficSource: tsFilter,
      country: null,
      condition:
        "IF campaign has deposits > 0 AND zone cost >= 0.8 * high-spend threshold AND zone conversions == 0.",
      suggestedThresholds: {
        minVisits: minVisitsForDecision,
        minCost: Math.round(highSpendNoConvCost * 0.8),
        maxROI: -80,
      },
      action: "pause_zone",
      appliesTo:
        "Zones inside campaigns that already generated deposits, but these zones show no conversions so far.",
      rationale:
        "Once a campaign proves it can generate deposits, zones that do not contribute and just burn cost can be aggressively trimmed.",
    });

    // 6) Apply rules to decide which zones to pause NOW
    const zonesToPauseNow: ZonePauseNow[] = [];

    for (const z of allZones) {
      const visits = z.visits;
      const cost = z.cost;
      const conversions = z.conversions;
      const roi = z.roi;

      if (!z.id || z.id.trim().length === 0) continue;

      // SKIP very small data (cooldown logic)
      if (visits < minVisitsForDecision * 0.5 && cost < minCostForDecision) {
        continue;
      }

      let reasons: string[] = [];

      // Rule 1: High-spend zero-conversion
      if (
        visits >= minVisitsForDecision &&
        cost >= highSpendNoConvCost &&
        conversions === 0 &&
        roi <= -100
      ) {
        reasons.push(
          `High spend with no conversions: visits=${visits}, cost=${cost.toFixed(
            2
          )}, ROI=${roi.toFixed(1)}%.`
        );
      }

      // Rule 2: Terrible ROI even with conversions
      if (
        visits >= minVisitsForDecision &&
        cost >= minCostForDecision &&
        conversions > 0 &&
        roi <= -150
      ) {
        reasons.push(
          `Extremely bad ROI despite conversions: cost=${cost.toFixed(
            2
          )}, conversions=${conversions}, ROI=${roi.toFixed(1)}%.`
        );
      }

      // Rule 3: Campaign outlier
      const cStats = campaignStats.get(z.campaignId);
      if (cStats) {
        const { avgROI, medianCost } = cStats;
        if (
          cost >= medianCost &&
          roi <= avgROI - 80 && // at least 80 pts worse than campaign avg
          visits >= minVisitsForDecision * 0.8
        ) {
          reasons.push(
            `Outlier vs campaign peers: zone ROI=${roi.toFixed(
              1
            )}% vs campaign avg ROI=${avgROI.toFixed(
              1
            )}%, cost>=median zone cost.`
          );
        }
      }

      // Rule 4: Deposit-aware non-contributor
      if (
        z.campaignDeposits > 0 &&
        cost >= highSpendNoConvCost * 0.8 &&
        conversions === 0
      ) {
        reasons.push(
          `Campaign has deposits (${z.campaignDeposits}) but this zone has 0 conversions and significant cost=${cost.toFixed(
            2
          )}.`
        );
      }

      // Optional soft check: global ROI disaster vs global mean
      if (
        roi <= globalMeanROI - 100 &&
        cost >= minCostForDecision &&
        visits >= minVisitsForDecision
      ) {
        reasons.push(
          `Global underperformer: ROI=${roi.toFixed(
            1
          )}% vs global mean ROI=${globalMeanROI.toFixed(1)}%.`
        );
      }

      // If multiple reasons, join them; if none, skip this zone
      if (!reasons.length) continue;

      zonesToPauseNow.push({
        campaignId: z.campaignId,
        campaignName: z.campaignName,
        zoneId: z.id,
        reason: reasons.join(" "),
        metrics: {
          visits,
          conversions,
          revenue: z.revenue,
          cost,
          roi,
        },
      });
    }

    // Sort by worst offenders first: highest cost, then worst ROI
    zonesToPauseNow.sort((a, b) => {
      const costDiff = b.metrics.cost - a.metrics.cost;
      if (Math.abs(costDiff) > 0.01) return costDiff;
      return a.metrics.roi - b.metrics.roi; // more negative first
    });

    const metaNotes: string[] = [];

    metaNotes.push(
      `Dynamic thresholds: minVisitsForDecision=${minVisitsForDecision}, minCostForDecision=${minCostForDecision}, highSpendNoConvCost=${highSpendNoConvCost}.`
    );
    metaNotes.push(
      `Global stats: medianVisits=${globalMedianVisits.toFixed(
        1
      )}, medianCost=${globalMedianCost.toFixed(2)}, meanROI=${globalMeanROI.toFixed(
        1
      )}%.`
    );
    if (!zonesToPauseNow.length) {
      metaNotes.push(
        "No zones met the strict criteria. Data might still be early or reasonably balanced."
      );
    }

    return jsonResponse({
      rules,
      zonesToPauseNow,
      meta: {
        generatedAt: new Date().toISOString(),
        dateRange,
        from,
        to,
        trafficSourceFilter: tsFilter,
        totalCampaigns: campaigns.length,
        totalZones: allZones.length,
        totalZonesFlagged: zonesToPauseNow.length,
        notes: metaNotes,
      },
    });
  } catch (error: any) {
    console.error("Optimizer preview error:", error);
    return jsonResponse(
      {
        error: "Optimizer preview error",
        message: error?.message || String(error),
      },
      500
    );
  }
}

/**
 * Small JSON helper
 */
function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
