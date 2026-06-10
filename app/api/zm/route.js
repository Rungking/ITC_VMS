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
      // ZoneMinder API Returns an object with keys: Monitor, Monitor_Status, etc.
      const m = item.Monitor;
      const ms = item.Monitor_Status;
      
      if (!m) return null;

      // ZoneMinder Status Detection based on actual JSON structure:
      // 1. Status: "Connected" means stream is actually established
      // 2. CaptureFPS: > 0 means frames are being received
      // 3. CaptureBandwidth: > 0 means data is flowing
      
      const statusText = String(ms?.Status || "").toLowerCase();
      const isConnected = statusText === "connected";
      const captureFPS = parseFloat(ms?.CaptureFPS || 0);
      const isCapturing = captureFPS > 0;
      const bandwidth = parseInt(ms?.CaptureBandwidth || 0);
      const hasDataFlow = bandwidth > 0;

      // Primary criteria for "Active":
      // - Enabled by user (Enabled: 1)
      // - Function is not "None"
      // - Must have actual connection/data (Connected OR capturing frames OR bandwidth > 0)
      const isEnabled = String(m.Enabled) === "1" || m.Enabled === 1;
      const functionName = String(m.Function || "").trim();
      const isFunctioning = functionName !== "None" && functionName !== "";
      
      const isActive = isEnabled && isFunctioning && (isConnected || isCapturing || hasDataFlow);
      
      console.log(`[Camera ID ${m.Id}] ${m.Name}: Status=${ms?.Status}, FPS=${ms?.CaptureFPS}, BW=${ms?.CaptureBandwidth} -> Result=${isActive ? "ACTIVE" : "INACTIVE"}`);

      return {
        id: String(m.Id),
        name: m.Name ?? `Camera ${m.Id}`,
        port: undefined,
        framerate: Number(m.MaxFPS) || 15,
        streamUrl: `${ZM_BASE_URL}/cgi-bin/nph-zms?mode=jpeg&monitor=${m.Id}&scale=100&token=${encodeURIComponent(token)}`,
        status: isActive ? "active" : "inactive",
        type: m.Type,
        path: m.Path
      };
    }).filter(Boolean);

    return NextResponse.json({ success: true, accessToken: token, cameras });
  } catch (error) {
    console.error("[/api/zm]", error);
    return NextResponse.json(
      { success: false, error: "Cannot connect to ZoneMinder" },
      { status: 500 }
    );
  }
}