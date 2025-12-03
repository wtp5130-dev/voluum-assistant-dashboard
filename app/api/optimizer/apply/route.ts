// app/api/optimizer/apply/route.ts
import { NextResponse } from "next/server";

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

type ApplyBody = {
  zonesToPauseNow: ZonePauseSuggestion[];
  dryRun?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyBody;

    const zonesToPauseNow = body.zonesToPauseNow ?? [];
    const dryRun = body.dryRun ?? false;

    if (!zonesToPauseNow.length) {
      return NextResponse.json(
        { error: "No zonesToPauseNow provided" },
        { status: 400 }
      );
    }

    // In a real implementation, you would:
    // 1. Group zones by trafficSource and campaign
    // 2. For PropellerAds, call their API to add each zone to the blacklist
    //
    // NOTE: The exact PropellerAds endpoint/payload can change – always
    //       confirm in their official API docs. This is pseudocode, NOT
    //       a guaranteed correct endpoint.
    //
    // Example shape (PSEUDOCODE ONLY):
    //
    // const token = process.env.PROPELLER_API_TOKEN;
    // if (!token && !dryRun) {
    //   throw new Error("Missing PROPELLER_API_TOKEN env var");
    // }
    //
    // for (const zone of zonesToPauseNow) {
    //   if (zone.trafficSource !== "PropellerAds (API Ready-2)") continue;
    //
    //   const payload = {
    //     // This depends on PropellerAds API schema:
    //     // e.g. campaign_id, zone_id, action: "blacklist", etc.
    //     campaign_id: zone.campaignId,
    //     zone_ids: [zone.zoneId],
    //   };
    //
    //   if (!dryRun) {
    //     const resp = await fetch("https://api.propellerads.com/.../blacklist", {
    //       method: "POST",
    //       headers: {
    //         "Content-Type": "application/json",
    //         Authorization: `Bearer ${token}`,
    //       },
    //       body: JSON.stringify(payload),
    //     });
    //
    //     if (!resp.ok) {
    //       const text = await resp.text();
    //       console.error("Propeller API error:", resp.status, text);
    //     }
    //   }
    // }

    // For now, just log what *would* be done:
    console.log(
      `[optimizer/apply] ${dryRun ? "DRY RUN" : "APPLYING"} ${
        zonesToPauseNow.length
      } zones`,
      zonesToPauseNow.map((z) => ({
        campaignId: z.campaignId,
        zoneId: z.zoneId,
        cost: z.metrics.cost,
        visits: z.metrics.visits,
      }))
    );

    return NextResponse.json(
      {
        ok: true,
        dryRun,
        pausedCount: zonesToPauseNow.length,
        message: dryRun
          ? "Dry run only – no changes sent to traffic sources."
          : "Stub: Implement PropellerAds API calls where indicated in the code comments.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("optimizer/apply error:", err);
    return NextResponse.json(
      {
        error: "optimizer_apply_error",
        message: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
