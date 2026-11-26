"use client";

// Playback from the NVR's own recording (Phase 2 will add the server's recordings and a 24 h timeline: W-20).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { History, Play } from "lucide-react";
import { useAppContext } from "@/components/providers";
import { LivePlayer } from "@/components/LivePlayer";
import { api } from "@/lib/api";

const DURATIONS = [5, 15, 30, 60]; // minutes

/** "YYYY-MM-DDTHH:mm" in the browser's local time - the format of <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PlaybackPage() {
  const { cameras } = useAppContext();
  const videoCameras = useMemo(() => cameras.filter((c) => (c.type ?? "").toUpperCase() !== "SWITCH"), [cameras]);

  const [cameraId, setCameraId] = useState("");
  const [start, setStart] = useState(() => toLocalInput(new Date(Date.now() - 60 * 60 * 1000)));
  const [duration, setDuration] = useState(15);
  const [request, setRequest] = useState<{ cameraId: string; start: string; end: string } | null>(null);

  // ?camera=<id> from the map popup; otherwise the first camera
  useEffect(() => {
    if (cameraId || videoCameras.length === 0) return;
    const fromUrl = new URLSearchParams(window.location.search).get("camera");
    const pick = videoCameras.find((c) => c.id === fromUrl) ?? videoCameras[0];
    Promise.resolve().then(() => setCameraId(pick.id));
  }, [cameraId, videoCameras]);

  const play = () => {
    if (!cameraId || !start) return;
    const startDate = new Date(start);
    const end = toLocalInput(new Date(startDate.getTime() + duration * 60 * 1000));
    // NVR local time, no timezone: the NVR and the viewer are in the same place (Thailand)
    setRequest({ cameraId, start: `${start}:00`, end: `${end}:00` });
  };

  const load = useCallback(
    () => (request ? api.playback(request.cameraId, request.start, request.end) : Promise.reject(new Error("-"))),
    [request]
  );

  const selected = videoCameras.find((c) => c.id === request?.cameraId);

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <History className="w-6 h-6 text-zinc-500" />
        <h2 className="text-2xl font-bold tracking-tight">ดูภาพย้อนหลัง</h2>
        <span className="text-xs text-zinc-500">จากภาพที่บันทึกใน NVR</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
        <label className="flex flex-col gap-1 text-xs font-medium min-w-56">
          กล้อง
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          >
            {videoCameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.deviceName ?? c.brand} ch{c.channel})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          เริ่ม (เวลาของ NVR)
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          ความยาว
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} นาที
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={play}
          disabled={!cameraId}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          <Play className="w-4 h-4" /> เล่น
        </button>
      </div>

      <div className="relative aspect-video w-full max-w-5xl rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-black">
        {request ? (
          <LivePlayer load={load} reloadKey={`${request.cameraId}|${request.start}|${request.end}`} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            เลือกกล้องและเวลา แล้วกด &quot;เล่น&quot;
          </div>
        )}
      </div>
      {request && selected && (
        <p className="mt-2 text-xs text-zinc-500">
          {selected.name}: {request.start.replace("T", " ")} - {request.end.replace("T", " ")}
        </p>
      )}
    </div>
  );
}
