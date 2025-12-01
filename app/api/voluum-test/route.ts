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

  const authUrl = `${base}/auth/access/session`;

  try {
    // 1) Get session token using accessId + accessKey
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accessId,
        accessKey,
      }),
    });

    const authText = await authRes.text();
    let authJson: any = null;
    try {
      authJson = authText ? JSON.parse(authText) : null;
    } catch {
      // ignore json parse errors
    }

    if (!authRes.ok || !authJson?.token) {
      return NextResponse.json(
        {
          step: "auth",
          calledUrl: authUrl,
          status: authRes.status,
          ok: authRes.ok,
          body: authJson || authText,
          message:
            "Failed to obtain cwauth-token. Check access ID / key and Voluum API settings.",
        },
        { status: 500 }
      );
    }

    const token = authJson.token as string;

    // 2) Use that token to call some API endpoint (for now: /report)
    const reportUrl = `${base}/report`;

    const reportRes = await fetch(reportUrl, {
      method: "GET",
      headers: {
        "cwauth-token": token,
        Accept: "application/json",
      },
    });

    const reportText = await reportRes.text();
    let reportJson: any = null;
    try {
      reportJson = reportText ? JSON.parse(reportText) : null;
    } catch {
      // ignore json parse errors
    }

    return NextResponse.json(
      {
        step: "report",
        authStatus: authRes.status,
        reportCalledUrl: reportUrl,
        reportStatus: reportRes.status,
        reportOk: reportRes.ok,
        reportBodySnippet: reportText.slice(0, 800),
        reportJson,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Voluum test error:", err);
    return NextResponse.json(
      {
        error: "Error calling Voluum",
        message: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
