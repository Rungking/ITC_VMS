import { NextResponse } from "next/server";

const ZM_BASE_URL = process.env.ZM_URL ?? "http://127.0.0.1:8080/zm";
const ZM_USER = process.env.ZM_USER ?? "admin";
const ZM_PASS = process.env.ZM_PASS ?? "admin";

export async function GET() {
  try {
    // 1. Login to ZoneMinder
    const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
      cache: "no-store",
    });

    if (!loginRes.ok) {
      return NextResponse.json(
        { success: false, error: "ZoneMinder login failed" },
        { status: 502 }
      );
    }

    const loginData = await loginRes.json();
    const token = loginData.access_token ?? loginData.credentials ?? "";

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Could not obtain access token" },
        { status: 401 }
      );
    }

    // 2. Fetch monitors
    const monitorsRes = await fetch(
      `${ZM_BASE_URL}/api/monitors.json?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );

    if (!monitorsRes.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch monitors" },
        { status: 502 }
      );
    }

    const monitorsData = await monitorsRes.json();
    const zmMonitors = monitorsData.monitors ?? [];

    // 3. Map ZM monitors → Camera format expected by the UI
    const cameras = zmMonitors.map((item) => {
      const m = item.Monitor ?? item;
      return {
        id: String(m.Id),
        name: m.Name ?? `Camera ${m.Id}`,
        port: undefined,
        framerate: Number(m.MaxFPS) || 15,
        streamUrl: `${ZM_BASE_URL}/cgi-bin/nph-zms?mode=jpeg&monitor=${m.Id}&scale=100&token=${encodeURIComponent(token)}`,
      };
    });

    return NextResponse.json({ success: true, accessToken: token, cameras });
  } catch (error) {
    console.error("[/api/zm]", error);
    return NextResponse.json(
      { success: false, error: "Cannot connect to ZoneMinder" },
      { status: 500 }
    );
  }
}