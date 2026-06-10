"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext, useLanguage } from "@/components/providers";
import { motion } from "motion/react";
import {
  Video,
  Activity,
  WifiOff,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog";
import { Camera } from "@/types";
import { useStreamVerification } from "@/hooks/use-stream-verification";

function CameraGridItem({
  cam,
  idx,
  setSelectedCamera,
  t,
  onStatusChange,
  fullscreen = false,
}: {
  cam: Camera;
  idx: number;
  setSelectedCamera: (cam: Camera) => void;
  t: (key: string) => string;
  onStatusChange?: (id: string, status: string) => void;
  fullscreen?: boolean;
}) {
  const streamUrl = cam.streamUrl ?? (cam.port ? `http://localhost:${cam.port}` : null);
  const { status: verifyStatus } = useStreamVerification(streamUrl);
  
  const [imgError, setImgError] = useState(false);
  
  // ตัดสถานะ "checking" ออกจากการอัปเดตสถานะของระบบ
  useEffect(() => {
    if (verifyStatus !== "checking") {
      const status = (cam.status === "inactive" || imgError) ? "inactive" : verifyStatus;
      onStatusChange?.(cam.id, status);
    }
  }, [cam.id, verifyStatus, cam.status, imgError, onStatusChange]);

  // สถานะสำหรับการแสดงผลใน Grid (ให้ยึดตาม cam.status จากระบบหลัก)
  const isOffline = cam.status === "inactive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      onClick={() => !isOffline && setSelectedCamera(cam)}
      className={`group relative overflow-hidden transition-all ${
        fullscreen
          ? "h-full bg-zinc-100 dark:bg-zinc-950"
          : "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md"
      } ${!isOffline ? "cursor-pointer" : ""}`}
    >
      {/* Video Feed */}
      <div className={
        fullscreen
          ? "absolute inset-0 bg-zinc-950 overflow-hidden flex items-center justify-center"
          : "relative aspect-video bg-zinc-950 overflow-hidden flex items-center justify-center"
      }>
        {isOffline ? (
          <div className="flex flex-col items-center justify-center text-zinc-500 space-y-2">
            <WifiOff className="w-8 h-8 opacity-20" />
            <span className="text-[10px] uppercase tracking-widest font-semibold opacity-40">
              {t("noSignal")}
            </span>
          </div>
        ) : (
          <Image
            src={streamUrl ?? "/placeholder-v.png"}
            unoptimized
            alt={cam.name}
            fill
            className="object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        )}

        {/* Hover Overlay */}
        {!isOffline && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 duration-300" />
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center space-x-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-medium text-white tracking-wider">
          {isOffline ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="text-zinc-300">{t("offline")}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t("liveStatus")}</span>
            </>
          )}
        </div>

        {/* FPS Badge */}
        <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-mono text-zinc-300">
          {cam.framerate} {t("fps")}
        </div>
      </div>

      {/* Camera name overlay (fullscreen only) */}
      {fullscreen && (
        <div className="absolute bottom-2 left-2 z-10 text-white text-[11px] font-semibold opacity-60 pointer-events-none">
          {cam.name}
        </div>
      )}

      {/* Info Bar (normal mode only) */}
      {!fullscreen && (
        <div className="p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm truncate pr-2">{cam.name}</h3>
            <Video className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {cam.port ?? cam.id}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function MonitorPage() {
  const { cameras } = useAppContext();
  const { t } = useLanguage();
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [gridColumns, setGridColumns] = useState(4);
  const [gridInitialized, setGridInitialized] = useState(false);
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, string>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const monitorRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      monitorRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  const handleStatusChange = React.useCallback((id: string, status: string) => {
    setCameraStatuses((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }));
  }, []);

  const activeStreamCount = Object.values(cameraStatuses).filter((s) => s === "active").length;
  const gridRows = Math.ceil(Math.max(cameras.length, 1) / gridColumns);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedGrid = localStorage.getItem("monitor-grid-columns");
    if (savedGrid) {
      const num = parseInt(savedGrid, 10);
      if (num >= 1 && num <= 6) setGridColumns(num);
    }
    setGridInitialized(true);
  }, []);

  // Save grid preference when it changes (only after initial load)
  useEffect(() => {
    if (!gridInitialized) return;
    localStorage.setItem("monitor-grid-columns", gridColumns.toString());
  }, [gridColumns, gridInitialized]);

  return (
    <div ref={monitorRef} className={`flex flex-col lg:flex-row h-screen overflow-hidden${isFullscreen ? " bg-zinc-100 dark:bg-zinc-950" : ""}`}>
      {/* Main Monitoring Area */}
      <div className={`flex-1 overflow-hidden flex flex-col min-w-0${isFullscreen ? " relative p-0" : " p-6"}`}>
        {/* Floating toolbar — visible on hover in fullscreen */}
        {isFullscreen && (
          <div className="absolute top-0 left-0 right-0 z-20 opacity-0 hover:opacity-100 transition-opacity duration-300">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/75 to-transparent">
              <div className="flex items-center space-x-1 bg-zinc-900/80 backdrop-blur-md p-1 rounded-xl border border-zinc-700/50">
                <div className="px-2 text-zinc-400">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGridColumns(num)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                      gridColumns === num
                        ? "bg-zinc-700 text-white shadow-sm ring-1 ring-zinc-600"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <div className="w-px h-5 bg-zinc-700 mx-1" />
                <button
                  onClick={toggleFullscreen}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                  title="ออกจาก Fullscreen"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center space-x-2 text-sm text-zinc-400">
                <Activity className="w-4 h-4 animate-pulse text-emerald-500" />
                <span>{activeStreamCount} / {cameras.length} {t("activeStreams")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Normal header (hidden in fullscreen) */}
        {!isFullscreen && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold tracking-tight">
                {t("monitor")}
              </h2>
              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/50 shadow-inner">
                <div className="px-2 text-zinc-400">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGridColumns(num)}
                    className={`
                      flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-all
                      ${
                        gridColumns === num
                          ? "bg-white dark:bg-zinc-700 text-zinc-950 dark:text-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-600"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-zinc-800"
                      }
                    `}
                  >
                    {num}
                  </button>
                ))}
                <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                <button
                  onClick={toggleFullscreen}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-zinc-800 transition-all"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Activity className="w-4 h-4 animate-pulse text-emerald-500" />
              <span>
                {activeStreamCount} / {cameras.length} {t("activeStreams")}
              </span>
            </div>
          </div>
        )}

        <div className={isFullscreen ? "flex-1 h-full min-h-0" : "flex-1 overflow-y-auto min-h-0"}>
          <div
            className={`grid transition-all duration-500 ${
              isFullscreen ? "h-full gap-px" : "gap-4"
            } ${
              gridColumns === 1
                ? "grid-cols-1"
                : gridColumns === 2
                  ? (isFullscreen ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2")
                  : gridColumns === 3
                    ? (isFullscreen ? "grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")
                    : gridColumns === 4
                      ? (isFullscreen ? "grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4")
                      : gridColumns === 5
                        ? (isFullscreen ? "grid-cols-5" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5")
                        : (isFullscreen ? "grid-cols-6" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6")
            }`}
            style={isFullscreen ? { gridTemplateRows: `repeat(${gridRows}, 1fr)` } : undefined}
          >
            {cameras.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm text-zinc-500">
                <Video className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium">{t("noCamerasFound")}</h3>
                <p className="text-sm opacity-60">{t("checkConfig")}</p>
              </div>
            ) : (
              cameras.map((cam, idx) => (
                <CameraGridItem
                  key={cam.id}
                  cam={cam}
                  idx={idx}
                  setSelectedCamera={setSelectedCamera}
                  t={t}
                  onStatusChange={handleStatusChange}
                  fullscreen={isFullscreen}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Video Dialog */}
      <Dialog
        open={!!selectedCamera}
        onOpenChange={(open) => !open && setSelectedCamera(null)}
      >
        <DialogContent className="max-w-6xl w-[90vw] p-0 overflow-hidden bg-black border-zinc-800">
          {selectedCamera && (
            <div className="relative flex flex-col h-full">
              <DialogHeader className="p-4 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-white flex items-center space-x-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{selectedCamera.name}</span>
                    <span className="text-xs font-normal text-zinc-400">
                      • {selectedCamera.port ?? selectedCamera.id}
                    </span>
                  </DialogTitle>
                </div>
              </DialogHeader>

              <div className="relative aspect-video w-full overflow-hidden bg-black">
                <Image
                  src={
                    selectedCamera.streamUrl ??
                    (selectedCamera.port
                      ? `http://localhost:${selectedCamera.port}`
                      : "/placeholder-v.png")
                  }
                  unoptimized
                  alt={selectedCamera.name}
                  fill
                  className="object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}