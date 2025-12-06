import { NextResponse } from "next/server";

// Minimal shape for incoming campaign creation
type CreateCampaignBody = {
  provider: string; // e.g., "propellerads"
  name: string;
  format: string; // e.g., push-classic
  country: string; // ISO code
  bid: number; // USD
  dailyBudget: number; // USD
  totalBudget: number | null; // USD
  device: "all" | "mobile" | "desktop";
  creative?: {
    title?: string;
    description?: string;
    imageUrl?: string | null;
  };
  dryRun?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateCampaignBody>;

    // Basic validation
    const provider = (body.provider || "").toString().toLowerCase();
    const name = (body.name || "").toString();
    const format = (body.format || "").toString();
    const country = (body.country || "").toString().toUpperCase();
    const bid = Number(body.bid ?? 0);
    const dailyBudget = Number(body.dailyBudget ?? 0);
    const totalBudget = body.totalBudget === null ? null : Number(body.totalBudget ?? 0);
    const device = (body.device as any) || "all";
    const dryRun = Boolean(body.dryRun ?? true);

    if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
    if (!format) return NextResponse.json({ error: "Missing format" }, { status: 400 });
    if (!country) return NextResponse.json({ error: "Missing country" }, { status: 400 });
    if (!(bid > 0)) return NextResponse.json({ error: "Bid must be > 0" }, { status: 400 });
    if (!(dailyBudget > 0)) return NextResponse.json({ error: "Daily budget must be > 0" }, { status: 400 });

    if (provider !== "propellerads") {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    const payload = {
      name,
      format,
      country,
      bid,
      dailyBudget,
      totalBudget: totalBudget ?? undefined,
      device,
      creative: body.creative ?? undefined,
      provider,
      dryRun,
    };

    // For now, we only support dry-run or token-less preview
    const token = process.env.PROPELLER_API_TOKEN;
    if (dryRun || !token) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          provider,
          message: !token
            ? "PROPELLER_API_TOKEN not set; returning dry-run payload."
            : "Dry run mode; not creating live.",
          payload,
        },
        { status: 200 }
      );
    }

    // Placeholder for future provider call implementation
    // const res = await fetch("https://ssp-api.propellerads.com/...", { ... });
    // const json = await res.json();
    // if (!res.ok) return NextResponse.json({ error: json?.message || "Provider error" }, { status: 502 });

    return NextResponse.json(
      {
        ok: true,
        provider,
        message: "Live creation not implemented yet; set dryRun=true to preview payload.",
        payload,
      },
      { status: 501 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Campaign create error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
