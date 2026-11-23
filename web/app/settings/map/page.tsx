"use client";

import dynamic from "next/dynamic";

const MapViewSettings = dynamic(() => import("@/components/MapViewSettings"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function SettingsMapPage() {
  return (
    <div className="h-full -m-6">
      <MapViewSettings />
    </div>
  );
}
