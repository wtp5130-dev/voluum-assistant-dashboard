import { NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/permissions";

export async function POST(request: Request) {
  try {
    const ok = await requirePermission("builder");
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const {
      name,
      trafficSource, // name or id
      country,
      bid,
      dailyBudget,
      totalBudget,
      destinationUrl,
      dryRun = true,
    } = body || {};

    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
    if (!trafficSource) return NextResponse.json({ error: "Missing trafficSource (name or id)" }, { status: 400 });
    if (!country) return NextResponse.json({ error: "Missing country" }, { status: 400 });

    const base = process.env.VOLUUM_API_BASE;
    const accessId = process.env.VOLUUM_ACCESS_ID;
    const accessKey = process.env.VOLUUM_ACCESS_KEY;

    if (!base || !accessId || !accessKey) {
      return NextResponse.json(
        { error: "Missing VOLUUM_API_BASE / VOLUUM_ACCESS_ID / VOLUUM_ACCESS_KEY" },
        { status: 500 }
      );
    }

    const authUrl = `${base.replace(/\/$/, "")}/auth/access/session`;
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify({ accessId, accessKey }),
    });
    const authJson = await authRes.json().catch(() => null);
    if (!authRes.ok || !authJson?.token) {
      return NextResponse.json(
        { step: "auth", status: authRes.status, body: authJson, error: "Failed to obtain cwauth-token" },
        { status: 502 }
      );
    }

    const token = authJson.token as string;

    // Build a generic campaign payload for Voluum (scaffold - adjust to your schema)
    const voluumPayload = {
      name,
      trafficSource,
      country,
      bid,
      dailyBudget,
      totalBudget: totalBudget ?? undefined,
      destinationUrl: destinationUrl ?? undefined,
    };

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          message: "Voluum create (dry-run): returning payload only.",
          payload: voluumPayload,
        },
        { status: 200 }
      );
    }

    // Live creation endpoint placeholder (adjust to actual Voluum API path and schema)
    // const createUrl = `${base.replace(/\/$/, "")}/campaigns`;
    // const createRes = await fetch(createUrl, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Accept: "application/json",
    //     "cwauth-token": token,
    //   },
    //   body: JSON.stringify(voluumPayload),
    // });
    // const createJson = await createRes.json().catch(() => null);
    // if (!createRes.ok) {
    //   return NextResponse.json(
    //     { step: "create", status: createRes.status, body: createJson, error: "Voluum create failed" },
    //     { status: 502 }
    //   );
    // }

    return NextResponse.json(
      {
        ok: false,
        message:
          "Live creation not implemented yet. Enable dryRun or share Voluum campaign create API spec to finalize.",
        payload: voluumPayload,
      },
      { status: 501 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Voluum campaign create error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
