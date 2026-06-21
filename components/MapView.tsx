"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppContext } from "@/components/providers";
import { Camera } from "@/types";
import { WifiOff, X } from "lucide-react";

type CameraPosition = { lat: number; lng: number };
type PositionMap = Record<string, CameraPosition>;

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 13;

function loadPositions(): PositionMap {
  try {
    const raw = localStorage.getItem("map-camera-positions");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function makeCameraIcon(L: any, cam: Camera) {
  const isActive = cam.status === "active";
  const color = isActive ? "#4f46e5" : "#ef4444";
  return L.divIcon({
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
          font-size:10px;font-weight:700;color:${color};
        ">${cam.id}</div>
        ${isActive ? `<div style="position:absolute;top:0;right:0;width:11px;height:11px;border-radius:50%;background:#10b981;border:2px solid white"></div>` : ""}
      </div>`,
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -48],
  });
}

export default function MapView() {
  const { cameras } = useAppContext();

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, any>>({});
  const LRef = useRef<any>(null);

  const [positions, setPositions] = useState<PositionMap>({});
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // โ”€โ”€ Init Leaflet โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  useEffect(() => {
    import("leaflet").then((leaflet) => {
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      LRef.current = leaflet;
      setPositions(loadPositions());
      setLeafletLoaded(true);
    });
  }, []);

  // โ”€โ”€ Init Map โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapContainerRef.current || initialized) return;

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
    return () => { map.remove(); mapRef.current = null; };
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

  // โ”€โ”€ Sync Markers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !initialized) return;

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

      const icon = makeCameraIcon(L, cam);

      if (markersRef.current[cam.id]) {
        markersRef.current[cam.id].setLatLng([pos.lat, pos.lng]);
        markersRef.current[cam.id].setIcon(icon);
      } else {
        const marker = L.marker([pos.lat, pos.lng], { icon, draggable: false });

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
    const ids = new Set(cameras.map((c) => c.id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!ids.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    });
  }, [cameras, positions, initialized]);

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
          </div>
        )}
      </div>
    </div>
  );
}
