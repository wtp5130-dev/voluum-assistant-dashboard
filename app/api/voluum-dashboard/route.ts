// app/api/voluum-dashboard/route.ts
import { NextResponse } from "next/server";

// 🔧 TEST VERSION – just to confirm we're editing the right file.
export async function GET() {
  return NextResponse.json(
    {
      debug: "voluum-dashboard-zones-test",
      kpis: [],
      campaigns: [
        {
          id: "test-campaign",
          name: "Test Campaign",
          trafficSource: "Test Source",
          visits: 1000,
          conversions: 10,
          signups: 5,
          deposits: 1,
          revenue: 100,
          profit: 50,
          roi: 50,
          cost: 50,
          cpa: 50,
          cpr: 10,
          zones: [
            {
              id: "zone-1",
              visits: 500,
              conversions: 5,
              revenue: 60,
              cost: 20,
              roi: 200,
            },
            {
              id: "zone-2",
              visits: 300,
              conversions: 2,
              revenue: 30,
              cost: 15,
              roi: 100,
            },
          ],
          creatives: [
            {
              id: "creative-1",
              name: "Creative 1",
              visits: 400,
              conversions: 4,
              revenue: 50,
              cost: 20,
              roi: 150,
            },
          ],
        },
      ],
    },
    { status: 200 }
  );
}
