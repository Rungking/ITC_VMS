"use client";

import React, { useState, useMemo } from "react";
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
  X
} from "lucide-react";

export default function CameraTablePage() {
  const appCtx = useAppContext() as any;
  const cameras = appCtx.cameras ?? [];
  const loading = appCtx.loading ?? false;
  const refreshCameras = appCtx.refreshCameras ?? (() => {});
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: 'path', direction: null });
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Delete State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const deviceTypes = ["ALL", "DVR/XVR", "IPC", "NVR", "EVS", "Thermal Camera", "IVSS", "ANPR Device"];
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
      // ดึงเฉพาะ IP Address ออกจาก path (เช่นจาก rtsp://192.168.1.109:554/... ดึงมาเฉพาะ 192.168.1.109)
      const pathStr = cam.path || "";
      const ipMatch = pathStr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      return {
        ...cam,
        displayIp: ipMatch ? ipMatch[1] : (pathStr || "N/A")
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
        const key = sortConfig.key === 'path' ? 'displayIp' : sortConfig.key;
        const aValue = String((a as any)[key] || "");
        const bValue = String((b as any)[key] || "");
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
        refresh();
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

  return (
    <div className="space-y-4">
      {/* Delete Confirmation Dialog matching image */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md bg-[#2d333e] border border-[#3e4655] rounded-lg overflow-hidden p-0 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#3e4655]">
            <h3 className="text-sm font-medium text-zinc-200">Prompt Message</h3>
            <button 
              onClick={() => setDeleteDialogOpen(false)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-8 flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0 bg-amber-500/10 rounded-full flex items-center justify-center">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-[#2d333e]">!</span>
              </div>
            </div>
            <p className="text-zinc-200 text-lg">
              Are you sure you want to delete the device?
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 py-3 bg-[#2d333e]">
            <button
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-8 py-2 bg-[#4ca9ff] hover:bg-[#3d8ad9] disabled:bg-zinc-600 text-white font-medium rounded transition-colors text-sm"
            >
              {isDeleting ? "..." : "OK"}
            </button>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-8 py-2 bg-[#3e4655] hover:bg-[#4a5466] text-zinc-300 font-medium rounded transition-colors text-sm"
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
          <span className="text-lg font-light text-zinc-400">+</span> Add
        </Link>
        <button 
          disabled={selectedIds.length === 0}
          onClick={() => handleDeleteClick(selectedIds)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
        >
          <Trash2 className="w-4 h-4 text-zinc-500" /> Delete
        </button>
        <button 
          disabled={selectedIds.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30"
        >
          <ExternalLink className="w-4 h-4 text-zinc-500" /> Move To
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
                <th className="w-16 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">{t("id")}</th>
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
                <th className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">{t("cameraName")}</th>
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
                <th className="w-48 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">Offline Reason</th>
                <th className="w-32 px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-right border-r border-zinc-200 dark:border-zinc-800">{t("actions")}</th>
                <th className="w-10 px-4 py-3">
                  <Filter className="w-3.5 h-3.5 text-zinc-400" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedCameras.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center text-zinc-500 italic">
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
                    <td className="px-4 py-3 text-sm text-zinc-500">#{cam.id}</td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 truncate">
                      {cam.displayIp}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 truncate">
                      {cam.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {cam.type}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cam.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className={`text-sm ${cam.status === 'active' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                          {cam.status === 'active' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400 italic">
                      {cam.status === 'inactive' || cam.status === 'offline' ? 'Connection timeout' : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 text-zinc-400">
                        <Link 
                          href={`/settings/camera/table/edit?id=${cam.id}`}
                          className="hover:text-indigo-600 transition-colors" 
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button className="hover:text-indigo-600 transition-colors" title="View">
                          <Globe className="w-4 h-4" />
                        </button>
                        <button 
                          className="hover:text-rose-600 transition-colors" 
                          title="Delete"
                          onClick={() => handleDeleteClick([cam.id])}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
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