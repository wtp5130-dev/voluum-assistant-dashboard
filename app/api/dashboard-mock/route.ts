// app/api/voluum-test/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.VOLUUM_API_BASE;
  const accessId = process.env.VOLUUM_ACCESS_ID;
  const accessKey = process.env.VOLUUM_ACCESS_KEY;

  if (!base || !accessId || !accessKey) {
    return NextResponse.json(
      {
        error:
          "Missing VOLUUM_ACCESS_ID, VOLUUM_ACCESS_KEY or VOLUUM_API_BASE. Check .env.local.",
      },
      { status: 500 }
    );
  }

  const url = `${base}/report`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "cwauth-id": accessId,
        "cwauth-key": accessKey,
        Accept: "application/json",
      },
    });

    const text = await res.text();

    return NextResponse.json(
      {
        calledUrl: url,
        status: res.status,
        ok: res.ok,
        bodySnippet: text.slice(0, 800),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Error calling Voluum",
        message: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
