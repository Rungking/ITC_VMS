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

    console.log("[/api/zm] Fetching monitors from ZoneMinder:", monitorsRes.status, monitorsRes.statusText);

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
      // - Must have all 3 criteria from user: Status="Connected" AND FPS > 0 AND Bandwidth > 0
      const isEnabled = String(m.Enabled) === "1" || m.Enabled === 1;
      const functionName = String(m.Function || "").trim();
      const isFunctioning = functionName !== "None" && functionName !== "";
      
      const isActive = isEnabled && isFunctioning && isConnected && isCapturing && hasDataFlow;
      
      // DSS Device Type Detection Logic
      const pathStr = String(m.Path || "");
      const nameStr = String(m.Name || "").toUpperCase();
      let deviceType = "IPC"; // Default

      if (nameStr.includes("LPR") || nameStr.includes("ANPR")) {
        deviceType = "ANPR Device";
      }
      // Note: Default is IPC as seen in DSS for common IP cameras.
      // We avoid simple "channel=" check as many IPCs use it in their RTSP paths.
      
      console.log(`[Camera ID ${m.Id}] ${m.Name}: Status=${ms?.Status}, Type=${deviceType} -> Result=${isActive ? "ACTIVE" : "INACTIVE"}`);

      return {
        id: String(m.Id),
        name: m.Name ?? `Camera ${m.Id}`,
        port: undefined,
        framerate: Number(m.MaxFPS) || 15,
        streamUrl: `${ZM_BASE_URL}/cgi-bin/nph-zms?mode=jpeg&monitor=${m.Id}&scale=100&token=${encodeURIComponent(token)}`,
        status: isActive ? "active" : "inactive",
        type: deviceType,
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

export async function POST(request) {
  try {
    const body = await request.json();

    // 1. Login to ZoneMinder to get token
    const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
      cache: "no-store",
    });

    if (!loginRes.ok) {
      return NextResponse.json({ success: false, error: "ZM Login failed" }, { status: 502 });
    }

    const loginData = await loginRes.json();
    const token = loginData.access_token ?? loginData.credentials ?? "";

    // 2. Add Monitor
    const addRes = await fetch(`${ZM_BASE_URL}/api/monitors.json?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body), // ZoneMinder API expects form-urlencoded for many versions
    });

    const addData = await addRes.json();

    if (!addRes.ok) {
      return NextResponse.json({ success: false, ...addData }, { status: addRes.status });
    }

    return NextResponse.json({ success: true, ...addData });
  } catch (error) {
    console.error("[POST /api/zm]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ success: false, error: "Invalid IDs" }, { status: 400 });
    }

    // 1. Login to ZoneMinder
    const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
      cache: "no-store",
    });

    const loginData = await loginRes.json();
    const token = loginData.access_token ?? loginData.credentials ?? "";

    if (!token) {
      return NextResponse.json({ success: false, error: "Auth failed" }, { status: 401 });
    }

    // 2. Delete each monitor
    const results = await Promise.all(
      ids.map(async (id) => {
        const deleteRes = await fetch(
          `${ZM_BASE_URL}/api/monitors/${id}.json?token=${encodeURIComponent(token)}`,
          { method: "DELETE" }
        );
        return { id, ok: deleteRes.ok };
      })
    );

    const successCount = results.filter((r) => r.ok).length;

    return NextResponse.json({ 
      success: successCount > 0, 
      count: successCount,
      total: ids.length 
    });
  } catch (error) {
    console.error("ZM DELETE Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { id, data } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 });

    // 1. Login
    const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
      cache: "no-store",
    });
    const loginData = await loginRes.json();
    const token = loginData.access_token ?? loginData.credentials ?? "";

    // 2. Update Monitor
    const updateRes = await fetch(`${ZM_BASE_URL}/api/monitors/${id}.json?token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
    });

    const updateData = await updateRes.json();
    return NextResponse.json({ success: updateRes.ok, ...updateData });
  } catch (error) {
    console.error("ZM PUT Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}