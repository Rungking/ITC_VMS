"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, Camera, Video, Monitor, Globe, Network, Eye, EyeOff } from "lucide-react";
import { useLanguage, useAppContext } from "@/components/providers";

function EditCameraForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameraId = searchParams.get("id");
  const { t } = useLanguage();
  const { cameras } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // 🔘 แถบเลือกประเภทอุปกรณ์ (Tabs)
  const [deviceType, setDeviceType] = useState("IPC");

  // 🏷️ แบรนด์ของกล้องวงจรปิด
  const [cameraBrand, setCameraBrand] = useState("Dahua");

  // 📍 ข้อมูลตำแหน่งสำหรับ Map
  const [locationFields, setLocationFields] = useState({
    location: "",
    lat: "13.7563",
    lng: "100.5018"
  });

  // � ข้อมูลโทโพโลยี (Topology)
  const [topologyFields, setTopologyFields] = useState({
    parentId: "",
    parentPort: ""
  });

  // �🔌 ข้อมูลเครือข่ายและสิทธิ์เข้าถึง
  const [connectionFields, setConnectionFields] = useState({
    ip: "",
    port: "554",
    username: "admin",
    password: "admin",
    channel: "1",
    subtype: "0",
    customPath: ""
  });
  
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
    "Switch[Ports]": "8"
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

  // 🔄 ฟังก์ชันประกอบร่าง RTSP
  const generateRtspUrl = () => {
    const { username, password, ip, port, channel, subtype, customPath } = connectionFields;
    if (cameraBrand === "Custom") return customPath || "rtsp://";
    if (cameraBrand === "Hikvision") {
      const channelCode = `${channel}0${Number(subtype) + 1}`;
      return `rtsp://${username}:${password}@${ip}:${port}/Streaming/Channels/${channelCode}`;
    }
    if (cameraBrand === "Generic") return `rtsp://${username}:${password}@${ip}:${port}/live/ch${channel}`;
    return `rtsp://${username}:${password}@${ip}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
  };

  useEffect(() => {
    if (!cameraId) {
      Promise.resolve().then(() => setFetching(false));
      return;
    }
    if (cameras.length > 0) {
      const cam = cameras.find(c => c.id === cameraId);
      if (cam) {
        // Move all state updates to a microtask to avoid synchronous setState warning
        Promise.resolve().then(() => {
          setFormData({
            "Monitor[Name]": cam.name || "",
            "Monitor[Model]": cam.model || "",
            "Monitor[Type]": cam.type || "Ffmpeg",
            "Monitor[Function]": cam.function || "Mocord",
            "Monitor[Enabled]": cam.status === "active" ? "1" : "0",
            "Monitor[Method]": cam.method || "rtpRtsp",
            "Monitor[Path]": cam.path || "",
            "Monitor[Width]": String(cam.width || "640"),
            "Monitor[Height]": String(cam.height || "400"),
            "Monitor[Colours]": String(cam.colours || "4"),
            "Switch[Ports]": String(cam.ports || "8")
          });

          setLocationFields({
            location: cam.location || "",
            lat: String(cam.lat || "13.7563"),
            lng: String(cam.lng || "100.5018")
          });
          
          if (cam.type) setDeviceType(cam.type);
          if (cam.brand) setCameraBrand(cam.brand);
          
          setConnectionFields({
            ip: cam.ipAddress || cam.ip || "",
            port: String(cam.port || "554"),
            username: cam.username || "admin",
            password: cam.password || "admin",
            channel: String(cam.channel || "1"),
            subtype: String(cam.subtype || "0"),
            customPath: cam.brand === "Custom" ? (cam.path || "") : ""
          });

          setTopologyFields({
            parentId: cam.parentId || "",
            parentPort: String(cam.parentPort || "")
          });

          setFetching(false);
        });
      } else {
        Promise.resolve().then(() => setFetching(false));
      }
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

  const handleConnectionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConnectionFields(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocationFields(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const finalName = formData["Monitor[Name]"].trim();

    try {
      const isSwitch = deviceType === "SWITCH" || cameraId?.startsWith("SWITCH_");
      const generatedPath = isSwitch ? "" : generateRtspUrl();
      
      const metadata = {
        name: finalName,
        model: formData["Monitor[Model]"],
        type: deviceType,
        brand: cameraBrand,
        ip: connectionFields.ip,
        port: connectionFields.port,
        username: connectionFields.username,
        password: connectionFields.password,
        channel: connectionFields.channel,
        subtype: connectionFields.subtype,
        path: generatedPath,
        location: locationFields.location,
        lat: parseFloat(locationFields.lat),
        lng: parseFloat(locationFields.lng),
        ports: formData["Switch[Ports]"],
        parentId: topologyFields.parentId || null,
        parentPort: topologyFields.parentPort ? parseInt(topologyFields.parentPort) : null
      };

      let zmPayload = null;
      if (!isSwitch) {
        zmPayload = {
          ...formData,
          "Monitor[Name]": finalName,
          "Monitor[Path]": generatedPath
        };
      }

      const res = await fetch("/api/zm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cameraId,
          data: zmPayload,
          metadata: metadata
        }),
      });

      const result = await res.json();
      if (result.success) {
        router.push("/settings/camera/table");
        router.refresh();
      } else {
        alert(result.error || t("failedToUpdate") || "Failed to update device");
      }
    } catch (error) {
      console.error("Error updating device:", error);
      alert(t("errorOccurred") || "An error occurred");
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

      {/* ─── ส่วนสลับแท็บเลือกชนิดอุปกรณ์ (Tabs Selector) ─── */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-xl max-w-md border border-zinc-200 dark:border-zinc-800">
        {["IPC", "NVR", "SWITCH"].map((type) => (
          <button
            key={type}
            type="button"
            disabled={!cameraId?.startsWith("SWITCH_") && type === "SWITCH"}
            onClick={() => {
              setDeviceType(type);
              if (type === "SWITCH") setCameraBrand("Generic");
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              deviceType === type
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            } ${(!cameraId?.startsWith("SWITCH_") && type === "SWITCH") ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {type === "SWITCH" ? (t("switchEthernet") || "Switch Ethernet") : type}
          </button>
        ))}
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

              {deviceType !== "SWITCH" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("sourceType") || "Source Type"}</label>
                    <select
                      name="Monitor[Type]"
                      value={formData["Monitor[Type]"]}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="Ffmpeg">Ffmpeg (Common)</option>
                      <option value="Libvlc">Libvlc</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("function") || "Function"}</label>
                    <select
                      name="Monitor[Function]"
                      value={formData["Monitor[Function]"]}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="None">None</option>
                      <option value="Monitor">Monitor (Live only)</option>
                      <option value="Modect">Modect (Motion Detect)</option>
                      <option value="Record">Record (Always Record)</option>
                      <option value="Mocord">Mocord (Motion + Always)</option>
                      <option value="Nodect">Nodect (External Trigger)</option>
                    </select>
                  </div>
                </div>
              )}

              {deviceType !== "SWITCH" && (
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
              )}
            </div>
          </section>

          {/* กล่องที่ 2: ตั้งค่าการเชื่อมต่อ (สำหรับกลุ่มกล้องวิดีโอ IPC / NVR) */}
          {deviceType !== "SWITCH" && (
            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
                <Video className="w-5 h-5" />
                <h2 className="font-bold uppercase tracking-wider text-sm">{t("loginConnectionInfo") || "การเข้าถึงฮาร์ดแวร์และสิทธิ์การเข้าใช้งาน"}</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t("manufacturer") || "ผู้ผลิตกล้องวงจรปิด (Manufacturer)"}</label>
                  <div className="flex flex-wrap gap-2">
                    {["Dahua", "Hikvision", "Generic", "Custom"].map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setCameraBrand(brand)}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                          cameraBrand === brand
                            ? "bg-indigo-50 border-indigo-500 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-400 dark:text-indigo-400"
                            : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        }`}
                      >
                        {brand === "Generic" ? (t("genericBrand") || "แบรนด์ทั่วไป") :
                         brand === "Custom" ? (t("customBrand") || "ตั้งค่าเอง (Custom)") : brand}
                      </button>
                    ))}
                  </div>
                </div>

                {cameraBrand === "Custom" && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-medium text-orange-500">{t("customRtspPath") || "เส้นทาง RTSP แบบกำหนดเอง (Full Path)"}</label>
                    <input 
                      type="text" 
                      name="customPath" 
                      value={connectionFields.customPath} 
                      onChange={handleConnectionChange} 
                      placeholder="rtsp://admin:admin@192.168.1.108:554/live/main" 
                      className="w-full px-4 py-2 bg-orange-50/30 dark:bg-orange-950/10 border border-orange-200 dark:border-orange-900/50 rounded-xl outline-none text-sm font-mono" 
                      required 
                    />
                  </div>
                )}

                {cameraBrand !== "Custom" && (
                  <div className="grid grid-cols-3 gap-4 animate-in fade-in">
                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">{t("ipAddress") || "IP Address"}</label>
                      <input type="text" name="ip" value={connectionFields.ip} onChange={handleConnectionChange} placeholder="e.g. 192.168.1.108" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("devicePort") || "พอร์ตของอุปกรณ์"}</label>
                      <input type="text" name="port" value={connectionFields.port} onChange={handleConnectionChange} placeholder="554" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none" required />
                    </div>
                  </div>
                )}

                {cameraBrand !== "Custom" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("username") || "ชื่อผู้ใช้ (Username)"}</label>
                      <input type="text" name="username" value={connectionFields.username} onChange={handleConnectionChange} placeholder="admin" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("password") || "รหัสผ่าน (Password)"}</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} name="password" value={connectionFields.password} onChange={handleConnectionChange} className="w-full pl-4 pr-10 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none" required />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {cameraBrand !== "Custom" && (
                  <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("videoChannel") || "Video Channel"}</label>
                      <input type="number" name="channel" value={connectionFields.channel} onChange={handleConnectionChange} disabled={deviceType === "IPC"} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none disabled:bg-zinc-100 dark:disabled:bg-zinc-800/50 disabled:text-zinc-400" min="1" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("streamSubtype") || "ประเภทของสตรีมภาพ"}</label>
                      <select name="subtype" value={connectionFields.subtype} onChange={handleConnectionChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none">
                        <option value="0">Main Stream ({t("mainStreamDesc") || "คมชัดสูง"})</option>
                        <option value="1">Sub Stream ({t("subStreamDesc") || "ประหยัดเน็ตเวิร์ก"})</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">{t("autoGeneratedUrl") || "ลิงก์ระบบสตรีมย่อยปลายทางที่จะจัดส่งเข้าหลังบ้าน (Auto Generated)"}</span>
                  <code className="block mt-1 text-xs text-indigo-500 font-mono break-all">{generateRtspUrl()}</code>
                </div>
              </div>
            </section>
          )}

          {deviceType === "SWITCH" && (
            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
                <Network className="w-5 h-5" />
                <h2 className="font-bold uppercase tracking-wider text-sm">{t("switchConfiguration") || "การตั้งค่าระบบโครงข่ายแลน Switch"}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("switchIpAddress") || "IP Address ของ Switch"}</label>
                  <input type="text" name="ip" value={connectionFields.ip} onChange={handleConnectionChange} placeholder="e.g. 192.168.1.200" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("totalPorts") || "จำนวนพอร์ตใช้งาน (Network Ports)"}</label>
                  <select name="Switch[Ports]" value={formData["Switch[Ports]"]} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none">
                    <option value="5">5 Ports</option>
                    <option value="8">8 Ports</option>
                    <option value="16">16 Ports</option>
                    <option value="24">24 Ports</option>
                  </select>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar help / extra */}
        <div className="space-y-6">
          {/* ข้อมูลตำแหน่ง Map Location */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-indigo-600 dark:text-indigo-400">
              <Globe className="w-5 h-5" />
              <h2 className="font-bold text-sm">{t("location") || "ตำแหน่งติดตั้ง"}</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">{t("locationName") || "ชื่อสถานที่"}</span>
                <input
                  type="text"
                  name="location"
                  value={locationFields.location}
                  onChange={handleLocationChange}
                  placeholder="e.g. อาคาร A ชั้น 1"
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">{t("latitude") || "ละติจูด (Latitude)"}</span>
                  <input
                    type="text"
                    name="lat"
                    value={locationFields.lat}
                    onChange={handleLocationChange}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">{t("longitude") || "ลองจิจูด (Longitude)"}</span>
                  <input
                    type="text"
                    name="lng"
                    value={locationFields.lng}
                    onChange={handleLocationChange}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Topology Settings */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-indigo-600 dark:text-indigo-400">
              <Network className="w-5 h-5" />
              <h2 className="font-bold text-sm">Topology</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Parent Device</span>
                <select
                  value={topologyFields.parentId}
                  onChange={(e) => setTopologyFields(prev => ({ ...prev, parentId: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none"
                >
                  <option value="">None (Root)</option>
                  {cameras
                    .filter(c => c.id !== cameraId && (c.type === "SWITCH" || c.type === "NVR"))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>
                    ))
                  }
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Parent Port</span>
                <input
                  type="number"
                  value={topologyFields.parentPort}
                  onChange={(e) => setTopologyFields(prev => ({ ...prev, parentPort: e.target.value }))}
                  placeholder="e.g. 1"
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </section>

          {deviceType !== "SWITCH" && (
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
          )}

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