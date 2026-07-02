"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppContext } from "@/components/providers";
import { Camera } from "@/types";
import { Dialog, DialogContent } from "@/components/Dialog";
import {
  WifiOff, X, MapPin, RefreshCw, Search,
  ChevronRight, ChevronDown, GripVertical, Trash2, LocateFixed, Save,
} from "lucide-react";
import type L from "leaflet";

type CameraPosition = { lat: number; lng: number; location?: string };
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

export default function MapViewSettings() {
  const { cameras, refresh: refreshCameras } = useAppContext();

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const LRef = useRef<typeof L | null>(null);

  const [positions, setPositions] = useState<PositionMap>({});
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [groupExpanded, setGroupExpanded] = useState(true);
  const [draggingCamId, setDraggingCamId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const myLocationMarkerRef = useRef<L.Marker | null>(null);
  const myLocationCircleRef = useRef<L.Circle | null>(null);

  // -- Location Dialog State --
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [pendingLocationData, setPendingLocationData] = useState<{
    id: string;
    lat: number;
    lng: number;
    location: string;
  } | null>(null);

  // ── Init Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    import("leaflet").then((leaflet) => {
      // @ts-expect-error - Leaflet internals
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
              
              // Only update if different from current state
              if (!next[cam.id] || next[cam.id].lat !== dbLat || next[cam.id].lng !== dbLng) {
                next[cam.id] = { 
                  lat: dbLat, 
                  lng: dbLng, 
                  location: cam.location || "" 
                };
                changed = true;
              }
            }
          });
          
          if (changed) {
            return next;
          }
          return prev;
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

  // ── Sync Markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !initialized) return;

    // Use a temporary set to track which markers should stay
    const currentCameraIds = new Set(cameras.map(c => c.id));
    
    cameras.forEach((cam) => {
      const pos = positions[cam.id];
      if (!pos) {
        if (markersRef.current[cam.id]) {
          markersRef.current[cam.id].remove();
          delete markersRef.current[cam.id];
        }
        return;
      }

      // Check if marker exists and if its properties actually changed to avoid "flashing" markers
      const existingMarker = markersRef.current[cam.id];
      const icon = makeCameraIcon(L, cam);

      if (existingMarker) {
        const currentPos = existingMarker.getLatLng();
        if (currentPos.lat !== pos.lat || currentPos.lng !== pos.lng) {
          existingMarker.setLatLng([pos.lat, pos.lng]);
        }
        // Only update icon if status changed (to avoid unnecessary DOM churn)
        // We can check a custom property we attach
        if ((existingMarker as any)._status !== cam.status) { // eslint-disable-line @typescript-eslint/no-explicit-any
          existingMarker.setIcon(icon);
          (existingMarker as any)._status = cam.status; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      } else {
        const marker = L.marker([pos.lat, pos.lng], { icon, draggable: true });
        (marker as any)._status = cam.status; // eslint-disable-line @typescript-eslint/no-explicit-any

        marker.on("click", () => setSelectedCamera(cam));
        marker.on("dragend", (e: L.LeafletEvent) => {
          const target = e.target as L.Marker;
          const { lat, lng } = target.getLatLng();
          const existing = positions[cam.id];
          setPendingLocationData({
            id: cam.id,
            lat,
            lng,
            location: existing?.location || "",
          });
          setLocationDialogOpen(true);
        });
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
  }, [cameras, positions, initialized]);

  // ── Drag from Sidebar → Drop on Map ──────────────────────────────────────
  const handleMapDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleMapDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleMapDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const camId = e.dataTransfer.getData("camId");
    const L = LRef.current;
    const map = mapRef.current;
    if (!camId || !L || !map) return;

    const rect = mapContainerRef.current!.getBoundingClientRect();
    const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
    const latlng = map.containerPointToLatLng(point);

    setPendingLocationData({
      id: camId,
      lat: latlng.lat,
      lng: latlng.lng,
      location: "",
    });
    setLocationDialogOpen(true);
  }, []);

  const handleSaveLocation = useCallback(async () => {
    if (!pendingLocationData) return;
    const { id, lat, lng, location } = pendingLocationData;

    try {
      const res = await fetch("/api/zm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, lat, lng, location })
      });
      
      if (res.ok) {
        setPositions((prev) => {
          const updated = { ...prev, [id]: { lat, lng, location } };
          return updated;
        });
      } else {
        console.error("Failed to save location to database");
      }
    } catch (err) {
      console.error("Save Location Error:", err);
    }

    setLocationDialogOpen(false);
    setPendingLocationData(null);
    refreshCameras(true); // Silent refresh to update global context
  }, [pendingLocationData, refreshCameras]);

  const handleCancelLocation = useCallback(() => {
    if (pendingLocationData) {
      const camId = pendingLocationData.id;
      const existing = positions[camId];
      if (existing) {
        // Reset marker position to previous state if it was already on map
        if (markersRef.current[camId]) {
          markersRef.current[camId].setLatLng([existing.lat, existing.lng]);
        }
      } else {
        // If it was a new drop, remove the marker since it wasn't saved
        if (markersRef.current[camId]) {
          markersRef.current[camId].remove();
          delete markersRef.current[camId];
        }
      }
    }
    setLocationDialogOpen(false);
    setPendingLocationData(null);
  }, [pendingLocationData, positions]);

  const handleRemovePlacement = useCallback(async (camId: string) => {
    try {
      const res = await fetch("/api/zm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: camId, lat: null, lng: null, location: "" })
      });
      
      if (res.ok) {
        setPositions((prev) => {
          const updated = { ...prev };
          delete updated[camId];
          return updated;
        });
        if (markersRef.current[camId]) {
          markersRef.current[camId].remove();
          delete markersRef.current[camId];
        }
      }
    } catch (err) {
      console.error("Remove Placement Error:", err);
    }
    refreshCameras(true); // Silent refresh to update global context
  }, [refreshCameras]);

  const handleFlyTo = useCallback((cam: Camera) => {
    const pos = positions[cam.id];
    if (pos && mapRef.current) {
      mapRef.current.flyTo([pos.lat, pos.lng], 16, { animate: true, duration: 1 });
      setSelectedCamera(null);
    }
  }, [positions]);

  // ── My Location ───────────────────────────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const L = LRef.current;
        const map = mapRef.current;
        if (!L || !map) { setLocating(false); return; }

        // Remove previous location marker/circle
        if (myLocationMarkerRef.current) { myLocationMarkerRef.current.remove(); }
        if (myLocationCircleRef.current) { myLocationCircleRef.current.remove(); }

        // Accuracy circle
        myLocationCircleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: "#4f46e5",
          fillColor: "#4f46e5",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "4 4",
        }).addTo(map);

        // Pulsing "You are here" marker
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:18px;height:18px;border-radius:50%;
            background:#4f46e5;border:3px solid white;
            box-shadow:0 0 0 4px rgba(79,70,229,0.25);
            animation:pulse-loc 1.5s ease-in-out infinite;
          "></div>
          <style>@keyframes pulse-loc{0%,100%{box-shadow:0 0 0 4px rgba(79,70,229,0.25)}50%{box-shadow:0 0 0 10px rgba(79,70,229,0.08)}}</style>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        myLocationMarkerRef.current = L.marker([latitude, longitude], { icon })
          .bindPopup(`
            <div style="font-size:12px;line-height:1.6">
              <b>📍 Your Location</b><br/>
              Lat: ${latitude.toFixed(6)}<br/>
              Lng: ${longitude.toFixed(6)}<br/>
              <span style="color:#6b7280">±${Math.round(accuracy)} m accuracy</span>
            </div>
          `, { maxWidth: 220 })
          .addTo(map)
          .openPopup();

        map.flyTo([latitude, longitude], 16, { animate: true, duration: 1.5 });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError("Location permission denied.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationError("Location unavailable.");
        } else {
          setLocationError("Could not get location.");
        }
        setTimeout(() => setLocationError(null), 4000);
      },
      { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true }
    );
  }, []);

  const filteredCameras = cameras.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.includes(search)
  );
  const placedCount = Object.keys(positions).length;
  const onlineCount = cameras.filter((c) => c.status === "active").length;

  return (
    <div className="relative flex h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 bg-white dark:bg-[#1e2330] flex flex-col border-r border-zinc-200 dark:border-[#2e3547] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-[#2e3547]">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-bold text-zinc-900 dark:text-white">Camera Map</span>
              <span className="ml-auto text-[10px] text-zinc-500">{placedCount}/{cameras.length} placed</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search cameras..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-100 dark:bg-[#2e3547] border border-zinc-300 dark:border-[#3e4860] rounded-lg text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-2 px-4 py-2 border-b border-zinc-200 dark:border-[#2e3547]">
            <div className="flex-1 bg-zinc-100 dark:bg-[#2e3547] rounded-lg px-3 py-2 text-center">
              <div className="text-base font-bold text-emerald-500 dark:text-emerald-400">{onlineCount}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">Online</div>
            </div>
            <div className="flex-1 bg-zinc-100 dark:bg-[#2e3547] rounded-lg px-3 py-2 text-center">
              <div className="text-base font-bold text-red-500 dark:text-red-400">{cameras.length - onlineCount}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">Offline</div>
            </div>
            <div className="flex-1 bg-zinc-100 dark:bg-[#2e3547] rounded-lg px-3 py-2 text-center">
              <div className="text-base font-bold text-indigo-500 dark:text-indigo-400">{placedCount}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">On Map</div>
            </div>
          </div>

          {/* Camera List */}
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setGroupExpanded((v) => !v)}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-[#2e3547] transition-colors"
            >
              {groupExpanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
              Current Site
              <span className="ml-auto bg-zinc-200 dark:bg-[#3e4860] text-zinc-500 dark:text-zinc-400 rounded px-1.5 py-0.5 font-mono text-[9px]">
                {filteredCameras.length}
              </span>
            </button>

            {groupExpanded && (
              <div className="pb-4">
                {filteredCameras.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-8">No cameras found</p>
                )}
                {filteredCameras.map((cam) => {
                  const placed = !!positions[cam.id];
                  const isActive = cam.status === "active";
                  return (
                    <div
                      key={cam.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("camId", cam.id);
                        setDraggingCamId(cam.id);
                      }}
                      onDragEnd={() => setDraggingCamId(null)}
                      onClick={() => placed && handleFlyTo(cam)}
                      className={`group flex items-center gap-2.5 px-3 py-2.5 mx-2 mb-0.5 rounded-lg cursor-grab active:cursor-grabbing transition-all select-none
                        ${draggingCamId === cam.id
                          ? "opacity-40 bg-indigo-500/20"
                          : placed
                          ? "bg-zinc-100 dark:bg-[#2a3045] hover:bg-zinc-200 dark:hover:bg-[#313850]"
                          : "hover:bg-zinc-100 dark:hover:bg-[#2e3547]"
                        }`}
                    >
                      <GripVertical className="w-3 h-3 text-zinc-600 flex-shrink-0" />

                      <div className="relative flex-shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                        {isActive && (
                          <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{cam.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-zinc-600">#{cam.id}</span>
                          <span className="text-[9px] bg-zinc-200 dark:bg-[#3e4860] text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                            {cam.type || "IPC"}
                          </span>
                          {placed && (
                            <span className="text-[9px] bg-indigo-600/30 text-indigo-400 px-1.5 py-0.5 rounded">
                              ● On map
                            </span>
                          )}
                        </div>
                      </div>

                      {placed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemovePlacement(cam.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
                          title="Remove from map"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hint */}
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-[#2e3547]">
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              ⬛ Drag a camera onto the map to place it.<br />
              Click a placed camera to fly to it.<br />
              Drag its marker to fine-tune position.
            </p>
          </div>
        </div>
      )}

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1001] bg-white dark:bg-[#1e2330] border border-zinc-200 dark:border-[#2e3547] rounded-r-lg px-1 py-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        style={{ marginLeft: sidebarOpen ? "288px" : "0" }}
      >
        {sidebarOpen
          ? <ChevronRight className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3 rotate-180" />}
      </button>

      {/* ── Map Area ── */}
      <div className="flex-1 relative">
        {/* Drop overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-[900] bg-indigo-500/10 border-4 border-dashed border-indigo-500/60 flex items-center justify-center pointer-events-none">
            <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-medium text-sm shadow-2xl">
              Drop here to place camera
            </div>
          </div>
        )}

        {/* Map */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 z-0"
          onDragOver={handleMapDragOver}
          onDragLeave={handleMapDragLeave}
          onDrop={handleMapDrop}
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
          <hr className="border-zinc-200 dark:border-zinc-700" />
          <button
            onClick={() => {
              localStorage.removeItem("map-camera-positions");
              setPositions({});
            }}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-red-500 transition-colors w-full"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset all</span>
          </button>
        </div>

        {/* My Location button */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
          <button
            onClick={handleLocateMe}
            disabled={locating}
            title="Go to my current location"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow text-xs font-medium border transition-all
              ${locating
                ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-400 cursor-wait"
                : "bg-white/90 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700"
              } backdrop-blur-sm`}
          >
            {locating ? (
              <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5" />
            )}
            <span>{locating ? "Locating…" : "My Location"}</span>
          </button>

          {locationError && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-xs text-red-600 dark:text-red-400 backdrop-blur-sm shadow">
              <span>⚠ {locationError}</span>
            </div>
          )}
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

            <div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
              {selectedCamera.status === "active" && selectedCamera.streamUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedCamera.streamUrl}
                  alt={selectedCamera.name}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
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

            <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">Type</div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCamera.type || "IPC"}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">FPS</div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCamera.framerate}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold text-zinc-400 mb-0.5">ID</div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300">#{selectedCamera.id}</div>
              </div>
            </div>

            {/* Footer — remove from map */}
            <div className="flex justify-end px-4 py-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => { handleRemovePlacement(selectedCamera.id); setSelectedCamera(null); }}
                title="Remove from map"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove from map</span>
              </button>
            </div>
          </div>
        )}

        {/* --- Location Configuration Dialog --- */}
<Dialog open={locationDialogOpen} onOpenChange={(open) => !open && handleCancelLocation()}>
          <DialogContent className="max-w-md bg-white dark:bg-[#1e2330] border border-zinc-200 dark:border-[#2e3547] rounded-2xl overflow-hidden p-0 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-[#2e3547] bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                  <MapPin className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Configure Location</h3>
                  <p className="text-[11px] text-zinc-500">Add metadata for camera #{pendingLocationData?.id}</p>
                </div>
              </div>
              <button
                onClick={handleCancelLocation}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Latitude</label>
                  <div className="px-3 py-2 bg-zinc-100 dark:bg-[#2e3547] border border-zinc-200 dark:border-[#3e4860] rounded-xl text-xs font-mono text-zinc-600 dark:text-zinc-300">
                    {pendingLocationData?.lat?.toFixed(6)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Longitude</label>
                  <div className="px-3 py-2 bg-zinc-100 dark:bg-[#2e3547] border border-zinc-200 dark:border-[#3e4860] rounded-xl text-xs font-mono text-zinc-600 dark:text-zinc-300">
                    {pendingLocationData?.lng?.toFixed(6)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Location Name / Address</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. หมู่บ้านไทม์โฮม 62"
                  value={pendingLocationData?.location || ""}
                  onChange={(e) => setPendingLocationData(prev => prev ? { ...prev, location: e.target.value } : null)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveLocation()}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-[#2e3547] flex justify-end gap-3">
              <button
                onClick={handleCancelLocation}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLocation}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-sm shadow-indigo-500/20"
              >
                <Save className="w-4 h-4" />
                Save Position
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
