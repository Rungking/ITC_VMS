import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

const ZM_BASE_URL = process.env.ZM_URL ?? "http://127.0.0.1:8080/zm";
const ZM_USER = process.env.ZM_USER ?? "admin";
const ZM_PASS = process.env.ZM_PASS ?? "admin";

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    // 1. Login to ZoneMinder
    const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!loginRes.ok) {
      clearTimeout(timeoutId);
      // Return local data even if ZM connection fails
      const allMetadata = await prisma.monitorMetadata.findMany();
      const cameras = allMetadata.map(item => ({
        id: item.id,
        name: item.name,
        type: item.deviceType || "SWITCH",
        brand: item.brand || "",
        ip: item.ipAddress,
        ipAddress: item.ipAddress,
        model: item.model || "",
        status: "inactive",
        location: item.locationName || "",
        lat: item.latitude !== null ? Number(item.latitude) : 13.7563,
        lng: item.longitude !== null ? Number(item.longitude) : 100.5018,
        topoX: toFiniteNumber(item.topoX),
        topoY: toFiniteNumber(item.topoY)
      }));
      return NextResponse.json({ success: true, cameras, zmError: "ZoneMinder connection failed" });
    }

    const loginData = await loginRes.json();
    const token = loginData.access_token ?? loginData.credentials ?? "";

    // 2. Fetch monitors
    const monitorsRes = await fetch(
      `${ZM_BASE_URL}/api/monitors.json?token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: controller.signal }
    );

    const monitorsData = await monitorsRes.json();
    clearTimeout(timeoutId);
    const zmMonitors = monitorsData.monitors ?? [];

    // --- 🏷️ Source of Truth: Fetch Metadata from PostgreSQL ---
    const allMetadata = await prisma.monitorMetadata.findMany();

    // 3. Map Database Records to Camera format, merging ZM info if available
    const cameras = allMetadata.map((meta) => {
      // Find matching ZM monitor by ID or IP Address
      const zmItem = zmMonitors.find(item => {
        const m = item.Monitor;
        if (!m) return false;
        
        // Match by ID
        if (String(m.Id) === String(meta.id)) return true;
        
        // Match by IP in Path (e.g. rtsp://...192.168.1.108...)
        if (meta.ipAddress && m.Path && m.Path.includes(meta.ipAddress)) return true;
        
        return false;
      });

      const m = zmItem?.Monitor;
      const ms = zmItem?.Monitor_Status;
      
      let status = "inactive";
      let zmId = null;
      let streamUrl = "";

      if (zmItem && m) {
        zmId = String(m.Id);
        streamUrl = `${ZM_BASE_URL}/cgi-bin/nph-zms?mode=jpeg&monitor=${m.Id}&scale=100&token=${encodeURIComponent(token)}`;
        
        const statusText = String(ms?.Status || "").toLowerCase();
        const isConnected = statusText === "connected";
        const captureFPS = parseFloat(ms?.CaptureFPS || 0);
        const bandwidth = parseInt(ms?.CaptureBandwidth || 0);
        const isEnabled = String(m.Enabled) === "1" || m.Enabled === 1;
        const functionName = String(m.Function || "").trim();
        const isFunctioning = functionName !== "None" && functionName !== "";
        
        if (isEnabled && isFunctioning && isConnected && captureFPS > 0 && bandwidth > 0) {
          status = "active";
        }
      } else if (meta.deviceType === "SWITCH") {
        // Switch is always shown as active in this view for now
        status = "active";
      }

      return {
        id: meta.id,
        zmId: zmId,
        name: meta.name,
        type: meta.deviceType || "IPC",
        brand: meta.brand || "",
        ip: meta.ipAddress,
        ipAddress: meta.ipAddress,
        port: meta.port,
        username: meta.username,
        password: meta.password,
        channel: meta.channel,
        subtype: meta.subtype,
        model: meta.model || "",
        location: meta.locationName || "",
        lat: meta.latitude !== null ? Number(meta.latitude) : null,
        lng: meta.longitude !== null ? Number(meta.longitude) : null,
        path: meta.rtspPath || (m ? m.Path : ""),
        streamUrl: streamUrl,
        status: status,
        ports: meta.switchPorts,
        parentId: meta.parentId,
        parentPort: meta.parentPort,
        connectionType: meta.connectionType,
        topoX: toFiniteNumber(meta.topoX),
        topoY: toFiniteNumber(meta.topoY)
      };
    });

    return NextResponse.json({ success: true, accessToken: token, cameras });
  } catch (error) {
    console.error("[GET /api/zm]", error);
    // Even on crash, try to return local data if possible
    try {
      const allMetadata = await prisma.monitorMetadata.findMany();
      const cameras = allMetadata.map(item => ({
        id: item.id,
        name: item.name,
        type: item.deviceType || "SWITCH",
        brand: item.brand || "",
        ip: item.ipAddress,
        ipAddress: item.ipAddress,
        model: item.model || "",
        status: "inactive",
        location: item.locationName || "",
        lat: item.latitude !== null ? Number(item.latitude) : 13.7563,
        lng: item.longitude !== null ? Number(item.longitude) : 100.5018,
        ports: item.switchPorts,
        parentId: item.parentId,
        parentPort: item.parentPort,
        connectionType: item.connectionType,
        topoX: toFiniteNumber(item.topoX),
        topoY: toFiniteNumber(item.topoY)
      }));
      return NextResponse.json({ success: true, cameras, zmError: error.message });
    } catch (innerError) {
      console.error("[GET /api/zm] Critical failure:", innerError);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();

    // ── Bulk Import Helper ──────────────────────────────────────────────────
    if (payload.bulk && Array.isArray(payload.items)) {
      const results = [];
      for (const item of payload.items) {
        const id = `LOCAL_${item.type || 'IPC'}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        try {
          await prisma.monitorMetadata.upsert({
            where: { id: id }, // This is technically a create since ID is unique
            update: {},
            create: {
              id: id,
              name: item.name || "Imported Device",
              deviceType: item.type || "IPC",
              brand: item.brand || "",
              model: item.model || "",
              ipAddress: item.ip || "",
              locationName: item.location || "",
              latitude: (item.lat !== undefined && item.lat !== null) ? parseFloat(item.lat) : null,
              longitude: (item.lng !== undefined && item.lng !== null) ? parseFloat(item.lng) : null,
              parentId: item.parentId,
              parentPort: (item.parentPort !== undefined && item.parentPort !== null) ? parseInt(item.parentPort) : null,
              connectionType: item.connectionType || "ETHERNET",
              topoX: toFiniteNumber(item.topoX),
              topoY: toFiniteNumber(item.topoY)
            }
          });
          results.push({ name: item.name, success: true });
        } catch (e) {
          results.push({ name: item.name, success: false, error: e.message });
        }
      }
      return NextResponse.json({ success: true, results });
    }

    const { zmData, metadata } = payload;

    if (metadata.type === "SWITCH") {
      const switchId = `SWITCH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await prisma.monitorMetadata.create({
        data: {
          id: switchId,
          name: metadata.name,
          model: metadata.model,
          deviceType: "SWITCH",
          ipAddress: metadata.ip,
          switchPorts: parseInt(metadata.ports || "8"),
          locationName: metadata.location,
          latitude: metadata.lat,
          longitude: metadata.lng,
          parentId: metadata.parentId,
          parentPort: metadata.parentPort ? parseInt(metadata.parentPort) : null,
          connectionType: metadata.connectionType || "ETHERNET",
          topoX: toFiniteNumber(metadata.topoX),
          topoY: toFiniteNumber(metadata.topoY)
        }
      });
      return NextResponse.json({ success: true, monitorId: switchId });
    }

    let monitorId = null;
    let zmError = null;

    try {
      const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
        cache: "no-store",
      });
      const loginData = await loginRes.json();
      const token = loginData.access_token ?? loginData.credentials ?? "";

      if (token && zmData) {
        const addRes = await fetch(`${ZM_BASE_URL}/api/monitors.json?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(zmData),
        });
        const addData = await addRes.json();
        if (addRes.ok) {
          monitorId = addData.monitorId || (addData.message && addData.message.match(/ID (\d+)/)?.[1]);
        }
      }
    } catch (err) {
      zmError = err.message;
    }

    const finalId = monitorId ? String(monitorId) : `LOCAL_${metadata.type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await prisma.monitorMetadata.upsert({
      where: { id: finalId },
      update: {
        name: metadata.name,
        model: metadata.model,
        deviceType: metadata.type,
        brand: metadata.brand,
        ipAddress: metadata.ip,
        port: metadata.port,
        username: metadata.username,
        password: metadata.password,
        channel: metadata.channel,
        subtype: metadata.subtype,
        rtspPath: metadata.path,
        locationName: metadata.location,
        latitude: metadata.lat,
        longitude: metadata.lng,
        parentId: metadata.parentId,
        parentPort: metadata.parentPort ? parseInt(metadata.parentPort) : null,
        connectionType: metadata.connectionType || "ETHERNET",
        topoX: toFiniteNumber(metadata.topoX),
        topoY: toFiniteNumber(metadata.topoY)
      },
      create: {
        id: finalId,
        name: metadata.name,
        model: metadata.model,
        deviceType: metadata.type,
        brand: metadata.brand,
        ipAddress: metadata.ip,
        port: metadata.port,
        username: metadata.username,
        password: metadata.password,
        channel: metadata.channel,
        subtype: metadata.subtype,
        rtspPath: metadata.path,
        locationName: metadata.location,
        latitude: metadata.lat,
        longitude: metadata.lng,
        parentId: metadata.parentId,
        parentPort: metadata.parentPort ? parseInt(metadata.parentPort) : null,
        connectionType: metadata.connectionType || "ETHERNET",
        topoX: toFiniteNumber(metadata.topoX),
        topoY: toFiniteNumber(metadata.topoY)
      }
    });

    return NextResponse.json({ success: true, monitorId: finalId, zmSynced: !!monitorId, zmError });
  } catch (error) {
    console.error("[POST /api/zm] Error in POST handler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { ids } = await req.json();
    if (!ids) return NextResponse.json({ success: false, error: "Invalid IDs" }, { status: 400 });

    await prisma.monitorMetadata.deleteMany({ where: { id: { in: ids.map(id => String(id)) } } });

    const zmIds = ids.filter(id => !String(id).startsWith("SWITCH_") && !String(id).startsWith("LOCAL_"));
    
    if (zmIds.length > 0) {
      try {
        const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
        });
        const loginData = await loginRes.json();
        const token = loginData.access_token ?? loginData.credentials ?? "";

        await Promise.all(zmIds.map(id => 
          fetch(`${ZM_BASE_URL}/api/monitors/${id}.json?token=${encodeURIComponent(token)}`, { method: "DELETE" })
        ));
      } catch (zmError) {
        console.warn("[DELETE /api/zm] ZM sync failed:", zmError.message);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/zm] Error in DELETE handler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const payload = await req.json();
    const { id, data, metadata } = payload;
    
    await prisma.monitorMetadata.upsert({
      where: { id: String(id) },
      update: {
        name: metadata.name,
        model: metadata.model,
        deviceType: metadata.type,
        brand: metadata.brand,
        ipAddress: metadata.ip,
        port: metadata.port,
        username: metadata.username,
        password: metadata.password,
        channel: metadata.channel,
        subtype: metadata.subtype,
        rtspPath: metadata.path,
        locationName: metadata.location,
        latitude: metadata.lat,
        longitude: metadata.lng,
        switchPorts: parseInt(metadata.ports || "8"),
        parentId: metadata.parentId,
        parentPort: metadata.parentPort ? parseInt(metadata.parentPort) : null,
        connectionType: metadata.connectionType,
        topoX: toFiniteNumber(metadata.topoX),
        topoY: toFiniteNumber(metadata.topoY)
      },
      create: {
        id: String(id),
        name: metadata.name,
        model: metadata.model,
        deviceType: metadata.type,
        brand: metadata.brand,
        ipAddress: metadata.ip,
        port: metadata.port,
        username: metadata.username,
        password: metadata.password,
        channel: metadata.channel,
        subtype: metadata.subtype,
        rtspPath: metadata.path,
        locationName: metadata.location,
        latitude: metadata.lat,
        longitude: metadata.lng,
        switchPorts: parseInt(metadata.ports || "8"),
        parentId: metadata.parentId,
        parentPort: metadata.parentPort ? parseInt(metadata.parentPort) : null,
        connectionType: metadata.connectionType,
        topoX: toFiniteNumber(metadata.topoX),
        topoY: toFiniteNumber(metadata.topoY)
      }
    });

    const sId = String(id);
    if (!sId.startsWith("SWITCH_") && !sId.startsWith("LOCAL_")) {
      try {
        const loginRes = await fetch(`${ZM_BASE_URL}/api/host/login.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ user: ZM_USER, pass: ZM_PASS }),
        });
        const loginData = await loginRes.json();
        const token = loginData.access_token ?? loginData.credentials ?? "";

        await fetch(`${ZM_BASE_URL}/api/monitors/${id}.json?token=${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(data),
        });
      } catch (zmError) {
        console.warn("[PUT /api/zm] ZM sync failed:", zmError.message);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/zm] Error in PUT handler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const payload = await req.json();
    
    // Support bulk updates for topology
    if (payload.bulk && Array.isArray(payload.items)) {
      await Promise.all(payload.items.map(item => 
        prisma.monitorMetadata.update({
          where: { id: String(item.id) },
          data: {
            topoX: item.topoX !== undefined ? toFiniteNumber(item.topoX) : undefined,
            topoY: item.topoY !== undefined ? toFiniteNumber(item.topoY) : undefined,
            parentId: item.parentId !== undefined ? item.parentId : undefined,
            parentPort: item.parentPort !== undefined ? (item.parentPort !== null ? parseInt(item.parentPort) : null) : undefined,
            connectionType: item.connectionType !== undefined ? item.connectionType : undefined,
            latitude: item.lat !== undefined ? item.lat : undefined,
            longitude: item.lng !== undefined ? item.lng : undefined,
            locationName: item.location !== undefined ? item.location : undefined
          }
        })
      ));
      return NextResponse.json({ success: true });
    }

    const { id, lat, lng, location, topoX, topoY, parentId, parentPort, connectionType } = payload;
    if (!id) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 });

    await prisma.monitorMetadata.update({
      where: { id: String(id) },
      data: {
        latitude: lat,
        longitude: lng,
        locationName: location,
        topoX: topoX !== undefined ? toFiniteNumber(topoX) : undefined,
        topoY: topoY !== undefined ? toFiniteNumber(topoY) : undefined,
        parentId,
        parentPort: (parentPort !== undefined && parentPort !== null) ? parseInt(parentPort) : (parentPort === null ? null : undefined),
        connectionType
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/zm] Error in PATCH handler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
