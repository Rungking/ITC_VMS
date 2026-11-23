"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, LayoutDashboard, TableProperties } from "lucide-react";
import { useLanguage } from "@/components/providers";

const getSidebarItems = (t: (key: string) => string) => [
  {
    href: "/settings/camera/overview",
    icon: LayoutDashboard,
    label: t("overview"),
  },
  {
    href: "/settings/camera/table",
    icon: TableProperties,
    label: t("table"),
  },
];

export default function CameraSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const sidebarItems = getSidebarItems(t);

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar - Fix top to 0 to align with global padding */}
      <aside className="w-64 flex-shrink-0">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col h-[calc(100vh-120px)] sticky top-0 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800">
            <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-100 dark:border-zinc-700 mb-3">
              <Camera className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              Camera Settings
            </h2>
            <div className="h-0.5 w-6 bg-indigo-500 rounded-full mt-1.5 opacity-50" />
          </div>

          {/* Menu Items */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
            {sidebarItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block relative group"
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl transition-all duration-300" />
                  )}
                  <div
                    className={`relative flex items-center px-3 py-2.5 rounded-xl transition-colors ${
                      isActive
                        ? "text-indigo-600 dark:text-indigo-400 font-medium"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span className="whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content - Match height and sticky position of sidebar */}
      <main className="flex-1 min-w-0 h-[calc(100vh-120px)] sticky top-0 overflow-y-auto scrollbar-none">
        {children}
      </main>
    </div>
  );
}
