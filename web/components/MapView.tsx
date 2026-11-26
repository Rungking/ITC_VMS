"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppContext } from "@/components/providers";
import { Camera } from "@/types";
import { WifiOff, X, Share2 } from "lucide-react";
import type L from "leaflet";
import Link from "next/link";
import { LivePlayer } from "@/components/LivePlayer";
import { api } from "@/lib/api";

type CameraPosition = { lat: number; lng: number };
type PositionMap = Record<string, CameraPosition>;

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 13;

function makeCameraIcon(leaflet: typeof L, cam: Camera) {
  const isActive = cam.status === "active";
  const color = isActive ? "#4f46e5" : "#ef4444";
  return leaflet.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:38px;height:46px">
        <div style="
          width:38px;height:38px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);background:${color};
          border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.35);
        "></div>
        <div style="
          position:absolute;top:7px;left:7px;
          width:22px;height:22px;border-radius:50%;
          background:rgba(255,255,255,.95);
          display:flex;align-items:center;justify-content:center;
          font-size:7px;font-weight:900;color:${color};
          text-transform:uppercase;overflow:hidden;
          line-height:1;text-align:center;padding:1px;
        ">${cam.type || "IPC"}</div>
        ${isActive ? `<div style="position:absolute;top:0;right:0;width:11px;height:11px;border-radius:50%;background:#10b981;border:2px solid white"></div>` : ""}
      </div>`,
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -48],
  });
}

export default function MapView() {
  const { cameras } = useAppContext();

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const linesRef = useRef<L.Polyline[]>([]);
  const LRef = useRef<typeof L | null>(null);

  const [positions, setPositions] = useState<PositionMap>({});
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [showTopology, setShowTopology] = useState(true);
  const isSwitchSelected = (selectedCamera?.type ?? "").toUpperCase() === "SWITCH";

  // Helper for curved lines
  const getCurvedPoints = (start: [number, number], end: [number, number], curvature = 0.15) => {
    const points = [];
    const [lat1, lng1] = start;
    const [lat2, lng2] = end;
    
    // Control point calculation (midpoint + perpendicular offset)
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;

    // Offset control point to create a curve
    const cpLat = midLat + (dLng * curvature);
    const cpLng = midLng - (dLat * curvature);

    for (let t = 0; t <= 1; t += 0.05) {
      const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * cpLat + t * t * lat2;
      const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * cpLng + t * t * lng2;
      points.push([lat, lng] as [number, number]);
    }
    return points;
  };

  // ── Init Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    import("leaflet").then((leaflet) => {
      delete (leaflet.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      LRef.current = leaflet;
      setLeafletLoaded(true);
    });
  }, []);

  // ── Sync Positions from Database ──────────────────────────────────────────
  useEffect(() => {
    if (cameras.length > 0) {
      Promise.resolve().then(() => {
        setPositions((prev) => {
          const next = { ...prev };
          let changed = false;
          cameras.forEach((cam) => {
            if (cam.lat != null && cam.lng != null) {
              const dbLat = Number(cam.lat);
              const dbLng = Number(cam.lng);
              if (!next[cam.id] || next[cam.id].lat !== dbLat || next[cam.id].lng !== dbLng) {
                next[cam.id] = { lat: dbLat, lng: dbLng };
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      });
    }
  }, [cameras]);

  // ── Init Map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    setInitialized(true);
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setInitialized(false);
      }
    };
  }, [leafletLoaded]);

  // โ"€โ"€ Fit to camera positions on first load โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€โ"€
  const hasFittedRef = useRef(false);
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !initialized || hasFittedRef.current) return;

    const coords = Object.values(positions);
    if (coords.length === 0) return;

    hasFittedRef.current = true;
    if (coords.length === 1) {
      map.setView([coords[0].lat, coords[0].lng], 16);
    } else {
      const bounds = L.latLngBounds(coords.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: false });
    }
  }, [initialized, positions]);

  // ── Sync Markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !initialized) return;

    const currentCameraIds = new Set(cameras.map((c) => c.id));

    cameras.forEach((cam) => {
      const pos = positions[cam.id];
      if (!pos) {
        // Remove marker if camera has no position
        if (markersRef.current[cam.id]) {
          markersRef.current[cam.id].remove();
          delete markersRef.current[cam.id];
        }
        return;
      }

      const existingMarker = markersRef.current[cam.id];
      const icon = makeCameraIcon(L, cam);

      if (existingMarker) {
        const currentPos = existingMarker.getLatLng();
        if (currentPos.lat !== pos.lat || currentPos.lng !== pos.lng) {
          existingMarker.setLatLng([pos.lat, pos.lng]);
        }
        // Use custom property to track status changes and avoid icon re-creation flash
        if ((existingMarker as any)._status !== cam.status) { // eslint-disable-line @typescript-eslint/no-explicit-any
          existingMarker.setIcon(icon);
          (existingMarker as any)._status = cam.status; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      } else {
        const marker = L.marker([pos.lat, pos.lng], { icon, draggable: false });
        (marker as any)._status = cam.status; // eslint-disable-line @typescript-eslint/no-explicit-any

        marker.on("click", () => setSelectedCamera(cam));
        marker.bindTooltip(
          `<div style="font-size:12px;font-weight:600;padding:2px 6px">${cam.name}</div>`,
          { permanent: false, direction: "top", offset: [0, -46] }
        );
        marker.addTo(map);
        markersRef.current[cam.id] = marker;
      }
    });

    // Remove orphan markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentCameraIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // ── Topology Lines ───────────────────────────────────────────────────────
    // Remove existing lines
    linesRef.current.forEach(line => line.remove());
    linesRef.current = [];

    if (showTopology) {
      cameras.forEach(cam => {
        if (cam.parentId && positions[cam.id] && positions[cam.parentId]) {
          const parentPos = positions[cam.parentId];
          const childPos = positions[cam.id];
          
          const connectionType = (cam.connectionType || "ETHERNET").toUpperCase();
          const isParentOnline = cameras.find(c => c.id === cam.parentId)?.status === "active";
          const isChildOnline = cam.status === "active";
          const isOffline = !isParentOnline || !isChildOnline;

          let color = "#6366f1"; // Indigo 500
          let glowColor = "rgba(99, 102, 241, 0.2)";
          let dashArray = "15, 10"; // Default flow for Ethernet
          
          if (isOffline) {
            color = "#94a3b8"; // Slate 400 (Gray)
            glowColor = "rgba(148, 163, 184, 0.1)";
            dashArray = "5, 5"; // Static small dashes
          } else if (connectionType === "FIBER") {
            color = "#ec4899"; // Pink 500
            glowColor = "rgba(236, 72, 153, 0.2)";
            dashArray = "10, 15";
          } else if (connectionType === "WIRELESS") {
            color = "#3b82f6"; // Blue 500
            glowColor = "rgba(59, 130, 246, 0.2)";
            dashArray = "4, 12";
          }

          const curvePoints = getCurvedPoints(
            [childPos.lat, childPos.lng], // Start from Device (Child)
            [parentPos.lat, parentPos.lng] // Flow to Parent (Switch/NVR)
          );

          // 1. Shadow/Glow Line
          const glowLine = L.polyline(
            curvePoints,
            {
              color: glowColor,
              weight: isOffline ? 6 : 10,
              opacity: isOffline ? 0.2 : 0.4,
              lineCap: 'round',
              interactive: false
            }
          ).addTo(map);

          // 2. Core Line
          const coreLine = L.polyline(
            curvePoints,
            {
              color,
              weight: isOffline ? 2 : 3,
              opacity: isOffline ? 0.4 : 0.8,
              dashArray,
              lineCap: 'round',
              className: isOffline ? '' : 'topology-line-animated'
            }
          ).addTo(map);

          linesRef.current.push(glowLine, coreLine);
        }
      });
    }
  }, [cameras, positions, initialized, showTopology]);

  const onlineCount = cameras.filter((c) => c.status === "active").length;
  const offlineCount = cameras.length - onlineCount;
  const placedCount = Object.keys(positions).length;

  return (
    <div className="relative h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      <div className="absolute inset-0">
        {/* Map */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 z-0"
        />

        {/* Loading */}
        {!initialized && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading map...</span>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-2xl shadow border border-zinc-200 dark:border-zinc-700 px-1 py-1 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-zinc-400" />
            <span className="text-zinc-500 dark:text-zinc-400">Total</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-100">{cameras.length}</span>
          </div>
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-500 dark:text-zinc-400">Online</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{onlineCount}</span>
          </div>
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-zinc-500 dark:text-zinc-400">Offline</span>
            <span className="font-bold text-red-600 dark:text-red-400">{offlineCount}</span>
          </div>
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-zinc-500 dark:text-zinc-400">On Map</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{placedCount}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl shadow border border-zinc-200 dark:border-zinc-700 p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-600" />
            <span className="text-zinc-600 dark:text-zinc-400">Online</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-zinc-600 dark:text-zinc-400">Offline</span>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-2" />
          
          <button
            onClick={() => setShowTopology(!showTopology)}
            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg transition-colors ${
              showTopology 
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span className="font-bold">Show Connections</span>
            <div className={`ml-auto w-8 h-4 rounded-full relative transition-colors ${showTopology ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showTopology ? "left-4.5" : "left-0.5"}`} />
            </div>
          </button>
        </div>

        {/* Camera detail popup */}
        {selectedCamera && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-80 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  selectedCamera.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`} />
                <span className="text-sm font-semibold truncate">{selectedCamera.name}</span>
                <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded">
                  {selectedCamera.type || "IPC"}
                </span>
              </div>
              <button
                onClick={() => setSelectedCamera(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isSwitchSelected && (
              <div className="relative bg-zinc-950 flex items-center justify-center min-h-[40px]">
                <div className="relative aspect-video w-full flex items-center justify-center">
                  {selectedCamera.status === "active" ? (
                    <LivePlayer
                      load={() => api.live(selectedCamera.id, "sub")}
                      reloadKey={selectedCamera.id}
                      className="absolute inset-0"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-600">
                      <WifiOff className="w-8 h-8 opacity-30" />
                      <span className="text-xs">Offline</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                    #{selectedCamera.id}
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">Type</div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCamera.type || "IPC"}</div>
              </div>
              <div>
                {isSwitchSelected ? (
                  <>
                    <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">Ports</div>
                    <div className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCamera.ports || 8}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">FPS</div>
                    <div className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCamera.framerate || 0}</div>
                  </>
                )}
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">IP Address</div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300 truncate">{selectedCamera.ipAddress || selectedCamera.ip || "N/A"}</div>
              </div>
            </div>
            {!isSwitchSelected && (
              <div className="px-4 pb-3">
                <Link
                  href={`/playback?camera=${selectedCamera.id}`}
                  className="block text-center text-xs font-medium py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  ดูภาพย้อนหลัง
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
