"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Camera, Video, Monitor, Network, Eye, EyeOff, Globe, FileUp, Download, AlertCircle } from "lucide-react";
import { useLanguage, useAppContext } from "@/components/providers";

export default function AddCameraPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { cameras } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // 🔘 แถบเลือกประเภทอุปกรณ์ (Tabs)
  const [deviceType, setDeviceType] = useState("IPC"); // IPC, NVR, SWITCH
  
  // 🏷️ แบรนด์ของกล้องวงจรปิด (สำหรับประกอบร่าง RTSP Syntax ตามแต่ละค่าย)
  const [cameraBrand, setCameraBrand] = useState("Dahua"); // Dahua, Hikvision, Generic, Custom

  // � ข้อมูลตำแหน่ง (Location & Coordinates)
  const [locationFields, setLocationFields] = useState({
    location: "",
    lat: "13.7563",
    lng: "100.5018"
  });

  const [topologyFields, setTopologyFields] = useState({
    parentId: "",
    parentPort: ""
  });

  // �📝 แยกฟิลด์สำหรับกรอกข้อมูลเครือข่ายและสิทธิ์เข้าถึง (Credentials)
  const [connectionFields, setConnectionFields] = useState({
    ip: "192.168.1.108",
    port: "554",
    username: "admin",
    password: "admin",
    channel: "1",
    subtype: "0", // 0 = Main Stream, 1 = Sub Stream
    customPath: "" // สำหรับกรอก URL เต็มรูปแบบกรณีแบรนด์อื่นๆ
  });

  // 📦 ข้อมูลพื้นฐานและมิติภาพที่ต้องส่งให้ ZoneMinder
  const [formData, setFormData] = useState({
    "Monitor[Name]": "",
    "Monitor[Model]": "",
    "Monitor[Type]": "Ffmpeg",
    "Monitor[Function]": "Mocord",
    "Monitor[Enabled]": "1",
    "Monitor[Method]": "rtpRtsp",
    "Monitor[Width]": "640",
    "Monitor[Height]": "400",
    "Monitor[Colours]": "4",
    // ข้อมูลเฉพาะของ Switch Ethernet
    "Switch[Ports]": "8"
  });

  const resolutionPresets = [
    { label: "Custom", w: "", h: "" },
    { label: "640x400", w: "640", h: "400" },
    { label: "1280x720 720p", w: "1280", h: "720" },
    { label: "1920x1080 1080p", w: "1920", h: "1080" },
    { label: "2560x1440 2K QHD", w: "2560", h: "1440" },
    { label: "3840x2160 4K UHD", w: "3840", h: "2160" },
  ];

  // อัปเดตข้อมูลเมื่อประเภทอุปกรณ์เปลี่ยน
  const handleDeviceTypeChange = (type: string) => {
    setDeviceType(type);
    
    // อัปเดตพอร์ตและแบรนด์
    if (type === "SWITCH") {
      setCameraBrand("Generic");
    } else {
      setConnectionFields(prev => ({ 
        ...prev, 
        port: "554",
        channel: type === "IPC" ? "1" : prev.channel
      }));
    }

    // อัปเดตชื่อดีฟอลต์
    setFormData(prev => {
      const currentName = prev["Monitor[Name]"];
      const prefixes = ["IPC_", "NVR_", "SWITCH_"];
      const isDefaultOrEmpty = !currentName || prefixes.some(p => currentName.startsWith(p));
      
      if (isDefaultOrEmpty) {
        let suffix = currentName;
        prefixes.forEach(p => {
          if (suffix.startsWith(p)) suffix = suffix.substring(p.length);
        });
        if (!suffix) suffix = `${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
        return { ...prev, "Monitor[Name]": `${type}_${suffix}` };
      }
      return prev;
    });
  };

  const handleCameraBrandChange = (brand: string) => {
    setCameraBrand(brand);
    if (deviceType !== "SWITCH") {
      setConnectionFields(prev => ({ ...prev, port: "554" }));
    }
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val !== "Custom") {
      const [w, h] = val.split("x");
      setFormData(prev => ({ ...prev, "Monitor[Width]": w, "Monitor[Height]": h }));
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
    setLocationFields(prev => ({ ...prev, [name]: value }));
  };

  // 🔄 ฟังก์ชันอัจฉริยะ: ตรวจสอบและประกอบร่างลิงก์ RTSP แยกลักษณะตามแต่ละแบรนด์สินค้า
  const generateRtspUrl = () => {
    const { username, password, ip, port, channel, subtype, customPath } = connectionFields;
    
    // หากเลือกแบบ Custom ให้ใช้ค่าที่กรอกเองโดยตรง
    if (cameraBrand === "Custom") {
      return customPath || "rtsp://";
    }

    if (cameraBrand === "Hikvision") {
      // ไวยากรณ์ของ Hikvision: รหัส 3 ตัวท้าย (รหัส 101 = กล้อง 1 สตรีมหลัก, รหัส 202 = กล้อง 2 สตรีมย่อย)
      const channelCode = `${channel}0${Number(subtype) + 1}`;
      return `rtsp://${username}:${password}@${ip}:${port}/Streaming/Channels/${channelCode}`;
    }
    
    if (cameraBrand === "Generic") {
      // ไวยากรณ์มาตรฐานกล้องจีนทั่วไปในตลาด
      return `rtsp://${username}:${password}@${ip}:${port}/live/ch${channel}`;
    }

    // ไวยากรณ์เริ่มต้นสำหรับค่าย Dahua (Default เครือข่ายเดิม)
    return `rtsp://${username}:${password}@${ip}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
  };

  // 📂 ฟังก์ชันสำหรับดาวน์โหลด Template CSV
  const downloadTemplate = () => {
    const headers = ["Name", "Type (IPC|NVR|SWITCH)", "Brand", "Model", "IP", "Port", "Username", "Password", "Channel", "Subtype", "Location", "Lat", "Lng", "Ports", "ParentID", "ParentPort"];
    const example = ["Front Gate IPC", "IPC", "Dahua", "HFW3241T", "192.168.1.108", "554", "admin", "admin", "1", "0", "Main Gate", "13.7563", "100.5018", "", "SWITCH_001", "5"];
    const example2 = ["Main Switch", "SWITCH", "Generic", "Layer2", "192.168.1.200", "", "", "", "", "", "Server Room", "13.7560", "100.5010", "24", "", ""];
    const csvContent = [
      headers.join(","), 
      example.join(","),
      example2.join(",")
    ].join("\n");
    
    // จัดการเรื่องภาษาไทยใน CSV (BOM)
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "camera_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 📤 ฟังก์ชันสำหรับ Import CSV
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportStatus(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) throw new Error("File is empty or invalid");

        const headers = lines[0].split(",").map(h => h.trim());
        const dataRows = lines.slice(1).filter(line => line.trim() !== "");

        let successCount = 0;
        let failCount = 0;

        for (const row of dataRows) {
          const values = row.split(",").map(v => v.trim());
          
          // ข้ามแถวที่ไม่มีข้อมูลจริง (ใช้ trim เพื่อตรวจสอบกรณีมีช่องว่าง)
          if (values.every(v => v.trim() === "")) continue;

          const item: Record<string, string> = {};
          headers.forEach((header, index) => {
            // Mapping column headers specifically for "Type" with helper text
            let key = header;
            if (header.includes("Type (IPC|NVR|SWITCH)")) key = "Type";
            item[key] = values[index];
          });

          // ตรวจสอบข้อมูลพื้นฐาน (ถ้ามีข้อมูลหลักหายไปบางส่วนให้นับเป็น Fail)
          if (!item.Name || !item.IP || !item.Type) {
            failCount++;
            continue;
          }

          // Case-insensitive check for SWITCH
          const deviceTypeUpper = (item.Type || "").toUpperCase();
          const isSwitch = deviceTypeUpper === "SWITCH" || deviceTypeUpper === "SWITCHETHERNET";

          let zmPayload = null;
          const metadata = {
            name: item.Name,
            model: item.Model || "",
            type: isSwitch ? "SWITCH" : (deviceTypeUpper || "IPC"),
            brand: isSwitch ? "Generic" : (item.Brand || "Dahua"),
            ip: item.IP,
            port: item.Port || "554",
            username: item.Username || "admin",
            password: item.Password || "admin",
            channel: item.Channel || "1",
            subtype: item.Subtype || "0",
            path: "",
            location: item.Location || "",
            lat: parseFloat(item.Lat || "13.7563") || 13.7563,
            lng: parseFloat(item.Lng || "100.5018") || 100.5018,
            ports: item.Ports || "8",
            parentId: item.ParentID || null,
            parentPort: item.ParentPort ? parseInt(item.ParentPort) : null
          };

          if (isSwitch) {
            // ✅ สำหรับ SWITCH ไม่ต้องมี zmPayload (API จะไม่ส่งไป ZoneMinder)
            zmPayload = null;
          } else {
            // ประกอบร่าง RTSP สำหรับกล้อง
            let path = "";
            const { Brand, Username, Password, IP, Port, Channel, Subtype } = item;
            const b = Brand || "Dahua";
            const u = Username || "admin";
            const p = Password || "admin";
            const i = IP;
            const pt = Port || "554";
            const c = Channel || "1";
            const s = Subtype || "0";

            if (b === "Hikvision") {
              path = `rtsp://${u}:${p}@${i}:${pt}/Streaming/Channels/${c}0${Number(s) + 1}`;
            } else if (b === "Generic") {
              path = `rtsp://${u}:${p}@${i}:${pt}/live/ch${c}`;
            } else {
              path = `rtsp://${u}:${p}@${i}:${pt}/cam/realmonitor?channel=${c}&subtype=${s}`;
            }
            metadata.path = path;

            zmPayload = {
              "Monitor[Name]": item.Name,
              "Monitor[Model]": item.Model || "",
              "Monitor[Type]": "Ffmpeg",
              "Monitor[Function]": "Mocord",
              "Monitor[Enabled]": "1",
              "Monitor[Method]": "rtpRtsp",
              "Monitor[Width]": "640",
              "Monitor[Height]": "400",
              "Monitor[Colours]": "4",
              "Monitor[Path]": path
            };
          }

          const res = await fetch("/api/zm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              zmData: zmPayload,
              metadata: metadata
            }),
          });

          const result = await res.json();
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        }

        setImportStatus({
          type: failCount === 0 ? 'success' : 'error',
          message: `Imported ${successCount} devices, Failed ${failCount} devices.`
        });
        if (successCount > 0) {
          router.refresh();
        }
      } catch {
        setImportStatus({ type: 'error', message: "Failed to parse CSV file." });
      } finally {
        setLoading(false);
        if (e.target) e.target.value = "";
      }
    };

    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const finalName = formData["Monitor[Name]"].trim() || `${t("newCamera") || "Device"}_${Date.now().toString().slice(-4)}`;
    
    try {
      let zmPayload = null;
      const generatedPath = deviceType === "SWITCH" ? "" : generateRtspUrl();
      
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

      if (deviceType !== "SWITCH") {
        zmPayload = {
          ...formData,
          "Monitor[Name]": finalName,
          "Monitor[Path]": generatedPath
        };
      }

      const res = await fetch("/api/zm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zmData: zmPayload,
          metadata: metadata
        }),
      });

      const result = await res.json();
      if (result.success) {
        router.push("/settings/camera/table");
        router.refresh();
      } else {
        alert(result.error || t("failedToAdd") || "Failed to add device");
      }
    } catch (error) {
      console.error("Error saving device:", error);
      alert(t("errorOccurred") || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 text-zinc-900 dark:text-zinc-100">
      {/* ─── ส่วนหัวหน้าเว็บบนสุด (Header) ─── */}
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
              {t("addCamera") || "เพิ่มอุปกรณ์"}
            </h1>
            <p className="text-sm text-zinc-500">
              {t("configureDeviceDesc") || "ตั้งค่าและลงทะเบียนอุปกรณ์ใหม่เข้าสู่ระบบควบคุมความปลอดภัย"}
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
          {t("save") || "บันทึก"}
        </button>
      </div>

      {/* ─── ส่วนสลับแท็บเลือกชนิดอุปกรณ์ (Tabs Selector) ─── */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-xl max-w-md border border-zinc-200 dark:border-zinc-800">
        {["IPC", "NVR", "SWITCH"].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleDeviceTypeChange(type)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              deviceType === type
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {type === "SWITCH" ? (t("switchEthernet") || "Switch Ethernet") : type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ─── ฝั่งฟอร์มกรอกรายละเอียดหลัก (ซ้าย-กลาง) ─── */}
        <div className="md:col-span-2 space-y-6">
          
          {/* กล่องที่ 1: ข้อมูลทั่วไปของอุปกรณ์ */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
              <Camera className="w-5 h-5" />
              <h2 className="font-bold uppercase tracking-wider text-sm">
                {t("generalSettings") || "ข้อมูลทั่วไป"}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("deviceName") || "ชื่ออุปกรณ์"}</label>
                <input type="text" name="Monitor[Name]" value={formData["Monitor[Name]"]} onChange={handleFormChange} placeholder="e.g. Front Gate IPC" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("cameraModel") || "รุ่น / โมเดล"}</label>
                <input type="text" name="Monitor[Model]" value={formData["Monitor[Model]"]} onChange={handleFormChange} placeholder="e.g. Dahua-HFW3241T" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
              </div>
            </div>
            
            {deviceType !== "SWITCH" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("sourceType") || "Source Type"}</label>
                  <select name="Monitor[Type]" value={formData["Monitor[Type]"]} onChange={handleFormChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="Ffmpeg">Ffmpeg (Common)</option>
                    <option value="Libvlc">Libvlc</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("function") || "Function"}</label>
                  <select name="Monitor[Function]" value={formData["Monitor[Function]"]} onChange={handleFormChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
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
          </section>

          {/* กล่องที่ 2: ตั้งค่าการเชื่อมต่อ (สำหรับกลุ่มกล้องวิดีโอ IPC / NVR) */}
          {deviceType !== "SWITCH" && (
            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
                <Video className="w-5 h-5" />
                <h2 className="font-bold uppercase tracking-wider text-sm">{t("loginConnectionInfo") || "การเข้าถึงฮาร์ดแวร์และสิทธิ์การเข้าใช้งาน"}</h2>
              </div>
              <div className="space-y-4">
                {/* แถบเลือกผู้ผลิตยี่ห้อสินค้า */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t("manufacturer") || "ผู้ผลิตกล้องวงจรปิด (Manufacturer)"}</label>
                  <div className="flex flex-wrap gap-2">
                    {["Dahua", "Hikvision", "Generic", "Custom"].map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => handleCameraBrandChange(brand)}
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
                    <p className="text-[10px] text-zinc-400 italic">* โปรดระบุ URL รูปแบบ RTSP ที่สมบูรณ์เพื่อให้ระบบสามารถดึงภาพได้</p>
                  </div>
                )}

                {/* แถวกรอก IP Address & Port */}
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

                {/* แถวกรอกสิทธิ์ผู้ใช้ Username & Password */}
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

                {/* แถวเลือก Channel และชนิดสตรีมภาพ */}
                {cameraBrand !== "Custom" && (
                  <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("videoChannel") || "Video Channel"}</label>
                      <input type="number" name="channel" value={connectionFields.channel} onChange={handleConnectionChange} disabled={deviceType === "IPC"} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none disabled:bg-zinc-100 dark:disabled:bg-zinc-800/50 disabled:text-zinc-400" min="1" />
                      {deviceType === "IPC" && <p className="text-[10px] text-zinc-400">{t("ipcChannelAlert") || "กล้องเดี่ยว IPC จะถูกล็อกสิทธิ์ให้รันที่ช่อง 1 เสมอ"}</p>}
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

                {/* กล่องแสดงตัวอย่างลิงก์สตรีมแบบแปลงข้อมูลให้สดๆ */}
                <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">{t("autoGeneratedUrl") || "ลิงก์ระบบสตรีมย่อยปลายทางที่จะจัดส่งเข้าหลังบ้าน (Auto Generated)"}</span>
                  <code className="block mt-1 text-xs text-indigo-500 font-mono break-all">{generateRtspUrl()}</code>
                </div>
              </div>
            </section>
          )}

          {/* กล่องที่ 2 (เฉพาะสลับหน้างาน): สำหรับ Switch Ethernet */}
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
                  <select name="Switch[Ports]" value={formData["Switch[Ports]"]} onChange={handleFormChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none">
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

        {/* ─── ฝั่งแถบควบคุมมิติภาพและความละเอียดด้านขวา (ขวา) ─── */}
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
              <p className="text-[10px] text-zinc-400 italic">
                * ข้อมูลนี้ใช้สำหรับระบุตำแหน่งอุปกรณ์บนแผนที่ (MapView)
              </p>
            </div>
          </section>

          {/* 🔗 เครือข่ายและโทโพโลยี (Topology) */}
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400">
              <Network className="w-5 h-5" />
              <h2 className="font-bold text-sm">Network Topology (Hierarchy)</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">เชื่อมต่อผ่าน (Parent Device)</span>
                <select 
                  value={topologyFields.parentId} 
                  onChange={(e) => setTopologyFields(prev => ({ ...prev, parentId: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none"
                >
                  <option value="">Standalone (No Parent)</option>
                  {cameras
                    .filter(c => c.type === "SWITCH" || c.type === "NVR")
                    .map(parent => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name} ({parent.type})
                      </option>
                    ))
                  }
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">พอร์ตที่เชื่อมต่อ (Parent Port)</span>
                <input 
                  type="number" 
                  min="1"
                  placeholder="e.g. 5"
                  value={topologyFields.parentPort} 
                  onChange={(e) => setTopologyFields(prev => ({ ...prev, parentPort: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none font-mono" 
                />
              </div>
            </div>
          </section>

          {deviceType !== "SWITCH" && (
            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Monitor className="w-5 h-5" />
                <h2 className="font-bold text-sm">{t("resolution") || "ความละเอียดภาพ"}</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold text-indigo-500">{t("presets") || "ค่าความละเอียดสำเร็จรูป"}</span>
                  <select onChange={handleResolutionChange} className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none" value={`${formData["Monitor[Width]"]}x${formData["Monitor[Height]"]}`}>
                    {resolutionPresets.map(p => <option key={p.label} value={p.label === "Custom" ? "Custom" : `${p.w}x${p.h}`}>{p.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">{t("width") || "ความกว้าง"}</span>
                    <input type="number" name="Monitor[Width]" value={formData["Monitor[Width]"]} onChange={handleFormChange} className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none" />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">{t("height") || "ความสูง"}</span>
                    <input type="number" name="Monitor[Height]" value={formData["Monitor[Height]"]} onChange={handleFormChange} className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none" />
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
