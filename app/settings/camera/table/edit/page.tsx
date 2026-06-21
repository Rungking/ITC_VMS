"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, Camera, Settings2, Video, Monitor } from "lucide-react";
import { useLanguage, useAppContext } from "@/components/providers";

function EditCameraForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameraId = searchParams.get("id");
  const { t } = useLanguage();
  const { cameras } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [formData, setFormData] = useState({
    "Monitor[Name]": "",
    "Monitor[Model]": "",
    "Monitor[Type]": "Ffmpeg",
    "Monitor[Function]": "Mocord",
    "Monitor[Enabled]": "1",
    "Monitor[Method]": "rtpRtsp",
    "Monitor[Path]": "",
    "Monitor[Width]": "640",
    "Monitor[Height]": "400",
    "Monitor[Colours]": "4",
  });

  const resolutionPresets = [
    { label: "Custom", w: "", h: "" },
    { label: "176x120 QCIF", w: "176", h: "120" },
    { label: "320x240", w: "320", h: "240" },
    { label: "352x240 CIF", w: "352", h: "240" },
    { label: "640x360", w: "640", h: "360" },
    { label: "640x400", w: "640", h: "400" },
    { label: "640x480", w: "640", h: "480" },
    { label: "704x480 4CIF", w: "704", h: "480" },
    { label: "704x576 D1 PAL", w: "704", h: "576" },
    { label: "720x480 Full D1 NTSC", w: "720", h: "480" },
    { label: "720x576 Full D1 PAL", w: "720", h: "576" },
    { label: "1280x720 720p", w: "1280", h: "720" },
    { label: "1280x960 960p", w: "1280", h: "960" },
    { label: "1920x1080 1080p", w: "1920", h: "1080" },
    { label: "2560x1440 2K QHD", w: "2560", h: "1440" },
    { label: "3840x2160 4K UHD", w: "3840", h: "2160" },
  ];

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val !== "Custom") {
      const [w, h] = val.split("x");
      setFormData(prev => ({
        ...prev,
        "Monitor[Width]": w,
        "Monitor[Height]": h
      }));
    }
  };

  useEffect(() => {
    if (!cameraId) {
      setFetching(false);
      return;
    }
    if (cameras.length > 0) {
      const cam = cameras.find(c => c.id === cameraId);
      if (cam) {
        // Find the matching ZM monitor details if possible, or use existing camera data
        setFormData({
          "Monitor[Name]": cam.name || "",
          "Monitor[Model]": cam.model || "",
          "Monitor[Type]": "Ffmpeg", // ZM defaults
          "Monitor[Function]": "Mocord",
          "Monitor[Enabled]": cam.status === "active" ? "1" : "0",
          "Monitor[Method]": "rtpRtsp",
          "Monitor[Path]": cam.path || "",
          "Monitor[Width]": "640",
          "Monitor[Height]": "400",
          "Monitor[Colours]": "4",
        });
      }
      setFetching(false);
    }
  }, [cameraId, cameras]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked ? "1" : "0" }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/zm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cameraId,
          data: formData
        }),
      });

      const result = await res.json();
      if (result.success) {
        // Save model to metadata
        if (cameraId) {
          const raw = localStorage.getItem("map-camera-positions");
          const metadata = raw ? JSON.parse(raw) : {};
          metadata[cameraId] = {
            ...metadata[cameraId],
            model: formData["Monitor[Model]"]
          };
          localStorage.setItem("map-camera-positions", JSON.stringify(metadata));
        }

        router.push("/settings/camera/table");
        router.refresh();
      } else {
        alert(result.error || "Failed to update camera");
      }
    } catch (error) {
      console.error("Error updating camera:", error);
      alert("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!cameraId) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        No camera ID specified.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {t("editCamera") || "Edit Camera"}
            </h1>
            <p className="text-sm text-zinc-500">
              Update configuration for camera #{cameraId}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-400 text-white rounded-xl font-medium transition-all shadow-sm"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t("save") || "Save"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Configuration */}
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
              <Camera className="w-5 h-5" />
              <h2 className="font-bold uppercase tracking-wider text-sm">General Settings</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("cameraName") || "Camera Name"}
                  </label>
                  <input
                    type="text"
                    name="Monitor[Name]"
                    value={formData["Monitor[Name]"]}
                    onChange={handleChange}
                    placeholder="e.g. Front Gate IPC"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("cameraModel") || "Model"}
                  </label>
                  <input
                    type="text"
                    name="Monitor[Model]"
                    value={formData["Monitor[Model]"]}
                    onChange={handleChange}
                    placeholder="e.g. Hikvision, Dahua..."
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Source Type</label>
                  <select
                    name="Monitor[Type]"
                    value={formData["Monitor[Type]"]}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="Ffmpeg">Ffmpeg (Common)</option>
                    <option value="Libvlc">Libvlc</option>
                    <option value="Remote">Remote</option>
                    <option value="Local">Local</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Function</label>
                  <select
                    name="Monitor[Function]"
                    value={formData["Monitor[Function]"]}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="None">None</option>
                    <option value="Monitor">Monitor (Live only)</option>
                    <option value="Modect">Modect (Motion detect)</option>
                    <option value="Record">Record (Always)</option>
                    <option value="Mocord">Mocord (Motion + Always)</option>
                    <option value="Nodect">Nodect (External)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 p-4 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl border border-indigo-100/50 dark:border-indigo-500/10">
                <input
                  type="checkbox"
                  id="enabled"
                  name="Monitor[Enabled]"
                  checked={formData["Monitor[Enabled]"] === "1"}
                  onChange={handleChange}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="enabled" className="text-sm font-medium text-indigo-900 dark:text-indigo-300 cursor-pointer">
                  Enabled (Activate streaming)
                </label>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
              <Video className="w-5 h-5" />
              <h2 className="font-bold uppercase tracking-wider text-sm">Source Configuration</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">RTSP Path / URL</label>
                <div className="relative">
                  <input
                    type="text"
                    name="Monitor[Path]"
                    value={formData["Monitor[Path]"]}
                    onChange={handleChange}
                    placeholder="rtsp://user:pass@ip:port/..."
                    className="w-full pl-4 pr-10 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Settings2 className="w-4 h-4 text-zinc-400" />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Support formats: RTSP, HTTP, RTMP, and file paths. Include credentials if required.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Method</label>
                  <select
                    name="Monitor[Method]"
                    value={formData["Monitor[Method]"]}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="rtpRtsp">RTP/RTSP</option>
                    <option value="rtpRtspHttp">RTP/RTSP/HTTP</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Colours</label>
                  <select
                    name="Monitor[Colours]"
                    value={formData["Monitor[Colours]"]}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none"
                  >
                    <option value="3">24 bit colour</option>
                    <option value="4">32 bit colour</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar help / extra */}
        <div className="space-y-6">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-zinc-900 dark:text-white">
              <Monitor className="w-5 h-5" />
              <h2 className="font-bold text-sm">Resolution</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold text-indigo-500">Presets</span>
                <select
                  onChange={handleResolutionChange}
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
                  value={resolutionPresets.find(p => p.w === formData["Monitor[Width]"] && p.h === formData["Monitor[Height]"])?.label || "Custom"}
                >
                  {resolutionPresets.map(preset => (
                    <option key={preset.label} value={preset.label === "Custom" ? "Custom" : `${preset.w}x${preset.h}`}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Width</span>
                  <input
                    type="number"
                    name="Monitor[Width]"
                    value={formData["Monitor[Width]"]}
                    onChange={handleChange}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Height</span>
                  <input
                    type="number"
                    name="Monitor[Height]"
                    value={formData["Monitor[Height]"]}
                    onChange={handleChange}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 overflow-hidden">
            <h3 className="text-amber-800 dark:text-amber-400 font-bold text-sm mb-2">Tip</h3>
            <p className="text-xs text-amber-700 dark:text-amber-500/80 leading-relaxed">
              For Dahua cameras, use the format:
              <code className="block mt-2 p-2 bg-white/50 dark:bg-black/20 rounded font-mono break-all leading-normal">
                rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0
              </code>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function EditCameraPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditCameraForm />
    </Suspense>
  );
}