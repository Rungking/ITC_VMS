"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useAppContext, useLanguage } from "@/components/providers";
import { Dialog, DialogContent } from "@/components/Dialog";
import { 
  Search, 
  Filter, 
  ExternalLink,
  Settings2,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Globe,
  X,
  Check,
  Download,
  Upload
} from "lucide-react";

export default function CameraTablePage() {
  const { cameras, loading, refresh: refreshCameras } = useAppContext();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: 'path', direction: null });
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Column Visibility State
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    const defaultVisibility = {
      id: true,
      ipAddress: true,
      cameraName: true,
      brand: true,
      model: true,
      type: true,
      status: true,
      parentId: true,
      offlineReason: true,
      mapLocation: true,
      actions: true,
    };

    if (typeof window === "undefined") {
      return defaultVisibility;
    }

    const saved = localStorage.getItem("camera-table-columns");
    if (!saved) {
      return defaultVisibility;
    }

    try {
      return { ...defaultVisibility, ...JSON.parse(saved) };
    } catch (error) {
      console.error("Failed to parse saved columns", error);
      return defaultVisibility;
    }
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const toggleColumn = (key: string) => {
    const newVisibility = { ...columnVisibility, [key]: !columnVisibility[key] };
    setColumnVisibility(newVisibility);
    localStorage.setItem("camera-table-columns", JSON.stringify(newVisibility));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowColumnFilter(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Delete State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const deviceTypes = ["ALL", "IPC", "NVR", "SWITCH", "DVR/XVR", "EVS", "Thermal Camera", "IVSS", "ANPR Device"];
  const statusOptions = ["ALL", "Online", "Offline"];

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedCameras = useMemo(() => {
    let result = [...cameras].map(cam => {
      // ดึงเฉพาะ IP Address ออกจาก path หรือใช้ field ip/ipAddress ตรงๆ
      const pathStr = cam.path || "";
      const ipMatch = pathStr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const hostIp = cam.ip || cam.ipAddress;
      
      return {
        ...cam,
        displayIp: hostIp || (ipMatch ? ipMatch[1] : (pathStr || "N/A"))
      };
    });

    // Search Filter
    if (search) {
      result = result.filter(cam => 
        cam.name.toLowerCase().includes(search.toLowerCase()) ||
        cam.displayIp.toLowerCase().includes(search.toLowerCase()) ||
        cam.id.includes(search)
      );
    }

    // Device Type Filter
    if (deviceTypeFilter !== "ALL") {
      result = result.filter(cam => (cam.type || "IPC") === deviceTypeFilter);
    }

    // Status Filter
    if (statusFilter !== "ALL") {
      const isOnline = statusFilter === "Online";
      result = result.filter(cam => (cam.status === 'active') === isOnline);
    }

    // Sorting
    if (sortConfig.direction) {
      result.sort((a, b) => {
        const key = (sortConfig.key === 'path' ? 'displayIp' : sortConfig.key) as keyof typeof a;
        const aValue = String(a[key] || "");
        const bValue = String(b[key] || "");
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue, undefined, { numeric: true }) 
          : bValue.localeCompare(aValue, undefined, { numeric: true });
      });
    }

    return result;
  }, [cameras, search, sortConfig, deviceTypeFilter, statusFilter]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAndSortedCameras.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSortedCameras.map(c => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExport = () => {
    if (filteredAndSortedCameras.length === 0) return;

    // เลือกใช้เฉพาะข้อมูลที่เลือก (ถ้ามีการเลือกไว้) หรือทั้งหมดที่แสดงอยู่
    const dataToExport = selectedIds.length > 0 
      ? filteredAndSortedCameras.filter(cam => selectedIds.includes(cam.id))
      : filteredAndSortedCameras;

    // Define headers
    const headers = [
      "ID",
      "IP Address",
      "Device Name",
      "Brand",
      "Model",
      "Device Type",
      "Status",
      "Location",
      "Latitude",
      "Longitude"
    ];

    // Map data to rows
    const csvContent = [
      headers.join(","),
      ...dataToExport.map(cam => [
        cam.zmId ? `#${cam.zmId}` : cam.id,
        cam.displayIp,
        `"${cam.name.replace(/"/g, '""')}"`,
        `"${(cam.brand || "").replace(/"/g, '""')}"`,
        `"${(cam.model || "").replace(/"/g, '""')}"`,
        cam.type || "IPC",
        cam.status === 'active' ? "Online" : "Offline",
        `"${(cam.location || "").replace(/"/g, '""')}"`,
        cam.lat ?? "",
        cam.lng ?? ""
      ].join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `device_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteClick = (ids: string[]) => {
    setIdsToDelete(ids);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (idsToDelete.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/zm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete })
      });
      const result = await res.json();
      if (result.success) {
        setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        setDeleteDialogOpen(false);
        refreshCameras();
      } else {
        alert("Failed to delete device(s)");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Error occurred while deleting");
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleColumnCount = Object.values(columnVisibility).filter(Boolean).length + 2; // +1 for checkbox, +1 for empty last col

  return (
    <div className="space-y-4">
      {/* Delete Confirmation Dialog matching image */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-[#2d333e] border border-zinc-200 dark:border-[#3e4655] rounded-lg overflow-hidden p-0 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-[#3e4655]">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Prompt Message</h3>
            <button 
              onClick={() => setDeleteDialogOpen(false)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-8 flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0 bg-amber-500/10 rounded-full flex items-center justify-center">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-white">!</span>
              </div>
            </div>
            <p className="text-zinc-700 dark:text-zinc-200 text-lg">
              Are you sure you want to delete the device?
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 py-3 bg-zinc-50 dark:bg-[#2d333e] border-t border-zinc-200 dark:border-[#3e4655]">
            <button
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-8 py-2 bg-[#4ca9ff] hover:bg-[#3d8ad9] disabled:bg-zinc-400 text-white font-medium rounded transition-colors text-sm"
            >
              {isDeleting ? "..." : "OK"}
            </button>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-8 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-[#3e4655] dark:hover:bg-[#4a5466] text-zinc-700 dark:text-zinc-300 font-medium rounded transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Top Toolbar matching DSS style */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <Link 
          href="/settings/camera/table/add"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
        >
          <span className="text-lg font-light text-zinc-400">+</span> {t("add") || "Add"}
        </Link>

        {/* --- Bulk Actions Group --- */}
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer">
          <Upload className="w-4 h-4 text-zinc-500" /> {t("import") || "Import"}
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              
              const reader = new FileReader();
              reader.onload = async (event) => {
                const text = event.target?.result as string;
                if (!text) return;
                
                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) return;
                
                const headers = lines[0].replace(/^\uFEFF/, "").split(",").map(h => h.trim());
                const rows = lines.slice(1);
                
                let successCount = 0;
                let failCount = 0;

                for (const line of rows) {
                  const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ''));
                  const item: any = {};
                  headers.forEach((h, i) => {
                    item[h] = values[i];
                  });

                  const deviceType = (item["Type (IPC|NVR|SWITCH)"] || "IPC").toUpperCase();
                  const isSwitch = deviceType === "SWITCH";
                  
                  // Generate Path for Cameras
                  let generatedPath = "";
                  if (!isSwitch) {
                    const b = item.Brand || "Dahua";
                    const u = item.Username || "admin";
                    const p = item.Password || "admin";
                    const i = item.IP;
                    const pt = item.Port || "554";
                    const c = item.Channel || "1";
                    const s = item.Subtype || "0";

                    if (b === "Hikvision") {
                      generatedPath = `rtsp://${u}:${p}@${i}:${pt}/Streaming/Channels/${c}0${Number(s) + 1}`;
                    } else if (b === "Generic") {
                      generatedPath = `rtsp://${u}:${p}@${i}:${pt}/live/ch${c}`;
                    } else {
                      generatedPath = `rtsp://${u}:${p}@${i}:${pt}/cam/realmonitor?channel=${c}&subtype=${s}`;
                    }
                  }

                  const metadata = {
                    name: item.Name,
                    model: item.Model || "",
                    type: deviceType,
                    brand: item.Brand || "Dahua",
                    ip: item.IP,
                    port: item.Port || (isSwitch ? "" : "554"),
                    username: item.Username || "admin",
                    password: item.Password || "admin",
                    channel: item.Channel || "1",
                    subtype: item.Subtype || "0",
                    path: generatedPath,
                    location: item.Location || "",
                    lat: parseFloat(item.Lat || "13.7563"),
                    lng: parseFloat(item.Lng || "100.5018"),
                    ports: item.Ports || "8",
                    parentId: item.ParentID || null,
                    parentPort: item.ParentPort ? parseInt(item.ParentPort) : null
                  };

                  let zmPayload = null;
                  if (!isSwitch) {
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
                      "Monitor[Path]": generatedPath
                    };
                  }

                  try {
                    const res = await fetch("/api/zm", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ zmData: zmPayload, metadata })
                    });
                    if (res.ok) successCount++;
                    else failCount++;
                  } catch (err) {
                    failCount++;
                  }
                }
                
                alert(`Import complete: ${successCount} success, ${failCount} failed`);
                refreshCameras();
              };
              reader.readAsText(file);
              e.target.value = ""; 
            }}
          />
        </label>

        <button 
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
        >
          <Download className="w-4 h-4 text-zinc-500" /> {t("export") || "Export"}
        </button>

        <button
          onClick={() => {
            const headers = ["Name", "Type (IPC|NVR|SWITCH)", "Brand", "Model", "IP", "Port", "Username", "Password", "Channel", "Subtype", "Location", "Lat", "Lng", "Ports", "ParentID", "ParentPort"];
            const example = ["Front Gate IPC", "IPC", "Dahua", "HFW3241T", "192.168.1.108", "554", "admin", "admin", "1", "0", "Main Gate", "13.7563", "100.5018", "", "SWITCH_001", "5"];
            const csvContent = ["\uFEFF" + headers.join(","), example.join(",")].join("\n");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "device_import_template.csv";
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-indigo-600 dark:text-indigo-400"
        >
          <Download className="w-4 h-4" /> {t("template") || "Template"}
        </button>

        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

        {/* --- Selection Actions Group --- */}
        <button 
          disabled={selectedIds.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
        >
          <ExternalLink className="w-4 h-4 text-zinc-500" /> {t("moveTo") || "Move To"}
        </button>

        <button 
          disabled={selectedIds.length === 0}
          onClick={() => handleDeleteClick(selectedIds)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
        >
          <Trash2 className="w-4 h-4 text-rose-500" /> {t("delete") || "Delete"}
        </button>

        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
          <Settings2 className="w-4 h-4 text-zinc-500" /> Time Zone Settings
        </button>
        
        <div className="flex-1" />

        <div className="relative">
          <input
            type="text"
            placeholder="Device Name/IP/ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 pr-10 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-sm overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800">
                <th className="w-12 px-4 py-3 text-center border-r border-zinc-200 dark:border-zinc-800">
                  <input 
                    type="checkbox" 
                    className="rounded border-zinc-300 dark:border-zinc-700" 
                    checked={selectedIds.length > 0 && selectedIds.length === filteredAndSortedCameras.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                {columnVisibility.id && (
                  <th className="w-16 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">{t("id")}</th>
                )}
                {columnVisibility.ipAddress && (
                  <th 
                    className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 group border-r border-zinc-200 dark:border-zinc-800"
                    onClick={() => handleSort('path')}
                  >
                    <div className="flex items-center gap-1">
                      {t("ipAddress") || "IP Address"}
                      <div className="flex flex-col opacity-30 group-hover:opacity-100">
                        <ChevronUp className={`w-3 h-3 -mb-1 ${sortConfig.key === 'path' && sortConfig.direction === 'asc' ? 'text-indigo-600' : ''}`} />
                        <ChevronDown className={`w-3 h-3 ${sortConfig.key === 'path' && sortConfig.direction === 'desc' ? 'text-indigo-600' : ''}`} />
                      </div>
                    </div>
                  </th>
                )}
                {columnVisibility.cameraName && (
                  <th 
                    className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 group"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      {t("cameraName")}
                      <div className="flex flex-col opacity-30 group-hover:opacity-100">
                        <ChevronUp className={`w-3 h-3 -mb-1 ${sortConfig.key === 'name' && sortConfig.direction === 'asc' ? 'text-indigo-600' : ''}`} />
                        <ChevronDown className={`w-3 h-3 ${sortConfig.key === 'name' && sortConfig.direction === 'desc' ? 'text-indigo-600' : ''}`} />
                      </div>
                    </div>
                  </th>
                )}
                {columnVisibility.brand && (
                  <th 
                    className="w-32 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 group"
                    onClick={() => handleSort('brand')}
                  >
                    <div className="flex items-center gap-1">
                      {t("brand") || "Brand"}
                      <div className="flex flex-col opacity-30 group-hover:opacity-100">
                        <ChevronUp className={`w-3 h-3 -mb-1 ${sortConfig.key === 'brand' && sortConfig.direction === 'asc' ? 'text-indigo-600' : ''}`} />
                        <ChevronDown className={`w-3 h-3 ${sortConfig.key === 'brand' && sortConfig.direction === 'desc' ? 'text-indigo-600' : ''}`} />
                      </div>
                    </div>
                  </th>
                )}
                {columnVisibility.model && (
                  <th 
                    className="w-40 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 group"
                    onClick={() => handleSort('model')}
                  >
                    <div className="flex items-center gap-1">
                      {t("cameraModel") || "Model"}
                      <div className="flex flex-col opacity-30 group-hover:opacity-100">
                        <ChevronUp className={`w-3 h-3 -mb-1 ${sortConfig.key === 'model' && sortConfig.direction === 'asc' ? 'text-indigo-600' : ''}`} />
                        <ChevronDown className={`w-3 h-3 ${sortConfig.key === 'model' && sortConfig.direction === 'desc' ? 'text-indigo-600' : ''}`} />
                      </div>
                    </div>
                  </th>
                )}
                {columnVisibility.type && (
                  <th className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      {t("type")}
                      <select 
                        className="bg-transparent border-none text-[10px] p-0 focus:ring-0 cursor-pointer text-indigo-500"
                        value={deviceTypeFilter}
                        onChange={(e) => setDeviceTypeFilter(e.target.value)}
                      >
                        {deviceTypes.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </th>
                )}
                {columnVisibility.status && (
                  <th className="w-40 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      {t("status")}
                      <select 
                        className="bg-transparent border-none text-[10px] p-0 focus:ring-0 cursor-pointer text-indigo-500"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </th>
                )}
                {columnVisibility.parentId && (
                  <th className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">
                    Parent Device
                  </th>
                )}
                {columnVisibility.offlineReason && (
                  <th className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">Offline Reason</th>
                )}
                {columnVisibility.mapLocation && (
                  <th className="w-64 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">Map Location</th>
                )}
                {columnVisibility.actions && (
                  <th className="w-32 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-right border-r border-zinc-200 dark:border-zinc-800">{t("actions")}</th>
                )}
                <th className="w-10 px-4 py-3 relative">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowColumnFilter(!showColumnFilter);
                    }}
                    className="hover:bg-zinc-200 dark:hover:bg-zinc-800 p-1 rounded transition-colors"
                  >
                    <Filter className="w-3.5 h-3.5 text-zinc-400" />
                  </button>

                  {showColumnFilter && (
                    <div 
                      ref={filterRef}
                      className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-1 mb-1">Display Columns</div>
                      <div className="max-h-64 overflow-y-auto">
                        {[
                          { key: 'id', label: t("id") },
                          { key: 'ipAddress', label: t("ipAddress") || "IP Address" },
                          { key: 'cameraName', label: t("cameraName") },
                          { key: 'brand', label: t("brand") || 'Brand' },
                          { key: 'model', label: t("cameraModel") || 'Model' },
                          { key: 'type', label: t("type") },
                          { key: 'status', label: t("status") },
                          { key: 'parentId', label: 'Parent Device' },
                          { key: 'offlineReason', label: t("offlineReason") || 'Offline Reason' },
                          { key: 'mapLocation', label: t("location") || 'Map Location' },
                          { key: 'actions', label: t("actions") },
                        ].map((col) => (
                          <label 
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer transition-colors group"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${columnVisibility[col.key] ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-300 dark:border-zinc-700'}`}>
                              {columnVisibility[col.key] && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <input 
                              type="checkbox"
                              className="hidden"
                              checked={columnVisibility[col.key]}
                              onChange={() => toggleColumn(col.key)}
                            />
                            <span className="text-sm text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-6 py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedCameras.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-6 py-20 text-center text-zinc-500 italic">
                    No records found
                  </td>
                </tr>
              ) : (
                filteredAndSortedCameras.map((cam) => (
                  <tr key={cam.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group ${selectedIds.includes(cam.id) ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-300 dark:border-zinc-700"
                        checked={selectedIds.includes(cam.id)}
                        onChange={() => toggleSelect(cam.id)}
                      />
                    </td>
                    {columnVisibility.id && (
                      <td className="px-4 py-3 text-sm text-zinc-500">
                        {cam.zmId ? `#${cam.zmId}` : ""}
                      </td>
                    )}
                    {columnVisibility.ipAddress && (
                      <td className="px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 truncate">
                        {cam.displayIp}
                      </td>
                    )}
                    {columnVisibility.cameraName && (
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 truncate">
                        {cam.name}
                      </td>
                    )}
                    {columnVisibility.brand && (
                      <td className="px-4 py-3 text-sm text-zinc-500 truncate">
                        {cam.brand || "-"}
                      </td>
                    )}
                    {columnVisibility.model && (
                      <td className="px-4 py-3 text-sm text-zinc-500 truncate">
                        {cam.model || "-"}
                      </td>
                    )}
                    {columnVisibility.type && (
                      <td className="px-4 py-3 text-sm text-zinc-500">
                        {cam.type}
                      </td>
                    )}
                    {columnVisibility.status && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${cam.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className={`text-sm ${cam.status === 'active' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                            {cam.status === 'active' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.parentId && (
                      <td className="px-4 py-3 text-sm text-zinc-500">
                        {cam.parentId ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              {cameras.find(c => c.id === cam.parentId)?.name || cam.parentId}
                            </span>
                            {cam.parentPort && (
                              <span className="text-[10px] text-zinc-400">Port: {cam.parentPort}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">-</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.offlineReason && (
                      <td className="px-4 py-3 text-sm text-zinc-400 italic">
                        {cam.status === 'inactive' ? 'Connection timeout' : '-'}
                      </td>
                    )}
                    {columnVisibility.mapLocation && (
                      <td className="px-4 py-3 text-sm">
                        {cam.location ? (
                          <div className="flex flex-col">
                            <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate" title={cam.location}>
                              {cam.location}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {cam.lat?.toFixed(4)}, {cam.lng?.toFixed(4)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">-</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.actions && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3 text-zinc-400">
                          <Link 
                            href={`/settings/camera/table/edit?id=${cam.id}`}
                            className="hover:text-indigo-600 transition-colors" 
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                          <a 
                            href={`http://${cam.displayIp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-indigo-600 transition-colors" 
                            title="Open in browser"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                          <button 
                            className="hover:text-rose-600 transition-colors" 
                            title="Delete"
                            onClick={() => handleDeleteClick([cam.id])}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3"></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer info matching DSS style */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            {t("total") || "Total"} <span className="font-bold">{filteredAndSortedCameras.length}</span> {t("items") || "Record(s)"} <span className="ml-2 font-bold text-indigo-600 underline cursor-pointer">{t("selected") || "Selected"}: {selectedIds.length}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button disabled className="p-1 px-2 border border-zinc-300 dark:border-zinc-700 rounded-l text-zinc-400 bg-zinc-100 dark:bg-zinc-800">&lt;</button>
              <button className="p-1 px-4 border-y border-zinc-300 dark:border-zinc-700 bg-indigo-600 text-white font-bold">1</button>
              <button disabled className="p-1 px-2 border border-zinc-300 dark:border-zinc-700 rounded-r text-zinc-400 bg-zinc-100 dark:bg-zinc-800">&gt;</button>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <select className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500">
                <option>20</option>
                <option>50</option>
                <option>100</option>
              </select>
              <span>per Page</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}