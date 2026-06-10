"use client";

import React, { useEffect } from "react";
import { useAppContext, useLanguage } from "@/components/providers";
import { useStreamVerification } from "@/hooks/use-stream-verification";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from "recharts";
import { Camera as CameraIcon, CheckCircle2, XCircle, Box, Loader2 } from "lucide-react";
import { Camera } from "@/types";

function StatusUpdater({ 
  camera, 
  updateStatus 
}: { 
  camera: Camera, 
  updateStatus: (id: string, status: Camera["status"]) => void 
}) {
  const streamUrl = camera.streamUrl;
  const { status: verifyStatus } = useStreamVerification(streamUrl || null);
  
  useEffect(() => {
    // ถ้า verifyStatus เป็น checking ให้ข้ามไปก่อน
    if (verifyStatus === "checking") return;

    // ถ้า verifyStatus เป็น active ให้อัปเดตเป็น active ทันที
    if (verifyStatus === "active") {
      updateStatus(camera.id, "active");
      return;
    }

    // กรณี verifyStatus เป็น inactive
    // ให้เช็คก่อนว่า camera.status เดิมเป็น active หรือไม่
    // ถ้าเดิมเป็น active ให้ยอมรับค่าจาก backend (ZM) เป็นหลัก 
    // เพื่อป้องกันกรณี fetch ตกหล่นแต่ ZM ยังบอกว่าออนไลน์อยู่
    if (verifyStatus === "inactive") {
      // ถ้า ZM ยังยืนยันว่า active เราจะไม่อัปเดตเป็น inactive ทันที (ป้องกัน False Offline)
      if (camera.status === "active") {
        return; 
      }
      updateStatus(camera.id, "inactive");
    }
  }, [verifyStatus, camera.id, updateStatus, camera.status]);

  return null;
}

export default function CameraOverviewPage() {
  const { cameras, loading, updateCameraStatus } = useAppContext();
  const { t } = useLanguage();
  const [isMounted, setIsMounted] = React.useState(false);
  
  React.useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // ใช้ useMemo เพื่อป้องกันการคำนวณใหม่และรักษาสถาปัตยกรรมข้อมูลให้คงที่
  const { total, onlineCount, offlineCount, data } = React.useMemo(() => {
    const total = cameras.length;
    // สิ่งที่ไม่ได้เป็น active ให้ถือว่าเป็น offline ทั้งหมด (รวมถึงที่กำลัง checking อยู่ด้วย)
    const online = cameras.filter(c => c.status === "active").length;
    const offline = total - online;

    const chartData = [
      { name: t("online"), value: online, color: "#10b981" },
      { name: t("offline"), value: offline, color: "#ef4444" },
    ];

    return { 
      total, 
      onlineCount: online, 
      offlineCount: offline, 
      data: chartData 
    };
  }, [cameras, t]);

  const stats = React.useMemo(() => [
    {
      label: t("totalCameras"),
      value: total,
      icon: Box,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: t("onlineStatus"),
      value: onlineCount,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      label: t("offlineStatus"),
      value: offlineCount,
      icon: XCircle,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-500/10",
    },
  ], [t, total, onlineCount, offlineCount]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* วนลูปเพื่อเช็คสถานะจริงของกล้องแต่ละตัว - ไม่อัปเดตสถานะ checking เพื่อป้องกันการกระพริบ */}
      {cameras.map(cam => (
        <StatusUpdater key={cam.id} camera={cam} updateStatus={updateCameraStatus} />
      ))}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {stat.label}
                </p>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {stat.value}
                </h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm flex flex-col min-h-0">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6">
          {t("connectivityDistribution")}
        </h3>
        <div className="flex-1 w-full min-h-0">
          {isMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#fff'
                  }} 
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-full h-48 w-48" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}