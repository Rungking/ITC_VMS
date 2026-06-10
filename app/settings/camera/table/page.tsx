"use client";

import React, { useState } from "react";
import { useAppContext, useLanguage } from "@/components/providers";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  ExternalLink,
  Settings2,
  Video,
  VideoOff
} from "lucide-react";

export default function CameraTablePage() {
  const { cameras, loading } = useAppContext();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const filteredCameras = cameras.filter(cam => 
    cam.name.toLowerCase().includes(search.toLowerCase()) ||
    cam.id.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          {t("cameraList")}
          <span className="text-sm font-normal text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {cameras.length}
          </span>
        </h2>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder={t("searchCameras")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-full md:w-64"
            />
          </div>
          <button className="p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Filter className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-bottom border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("id")}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("cameraName")}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("status")}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("type")}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("connectionPath")}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filteredCameras.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 italic">
                    {t("noCamerasFound")}
                  </td>
                </tr>
              ) : (
                filteredCameras.map((cam) => (
                  <tr key={cam.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-400">#{cam.id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${cam.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                          {cam.status === 'active' ? (
                            <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                          ) : (
                            <VideoOff className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">{cam.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        cam.status === 'active' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        {cam.status === 'active' ? t("online") : t("offline")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {cam.type || 'Ffmpeg'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-[11px] text-zinc-500 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 rounded border border-zinc-100 dark:border-zinc-800 block max-w-[200px] truncate" title={cam.path}>
                        {cam.path || 'N/A'}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}