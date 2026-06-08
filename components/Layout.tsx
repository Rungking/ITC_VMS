"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme, useLanguage } from "./providers";
import { useAuth } from "./AuthProvider";
import { useLicense } from "./LicenseProvider";
import Image from "next/image";
import {
  LayoutDashboard,
  TableProperties,
  Users,
  Settings,
  Sun,
  Moon,
  Languages,
  Route,
  History,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ClientOnly } from "./ClientOnly";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const { user, logout, setIsLoginOpen } = useAuth();
  const { isValid, daysRemaining } = useLicense();

  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  useEffect(() => setMounted(true), []);

  const navItems = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      label: t("dashboard"),
    },
    {
      href: "/monitor",
      icon: TableProperties, // Should ideally be a monitor icon but keeping consistent with existing
      label: t("monitor"),
    },
    {
      href: "/logs",
      icon: TableProperties,
      label: t("logs"),
    },
    {
      href: "/members",
      icon: Users,
      label: t("members"),
      roles: ["root", "admin", "user"], // Admin and User can access
    },
    {
      href: "/settings",
      icon: Settings,
      label: t("settings"),
      roles: ["root"], // User and Guest cannot access
    },
    {
      href: "/settings/users",
      icon: Users,
      label: t("userManagement"),
      roles: ["root", "admin"],
    },
    {
      href: "/settings/audit",
      icon: History,
      label: t("auditLogs"),
      roles: ["root", "admin", "user"],
    },
    {
      href: "/settings/license",
      icon: ShieldCheck,
      label: t("license"),
      roles: ["root"],
    },
  ];

  // Filter items based on role
  const visibleNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  });

  const isLoginPage = pathname === "/login";
  const isLicensePage = pathname === "/settings/license";

  if (!isLoginPage && !isLicensePage && isValid === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            {t("licenseRequired")}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8">
            {t("licenseRequiredDescription")}
          </p>
          <Link
            href="/settings/license"
            className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            {t("goToLicenseSettings")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden transition-colors duration-200 ${isLoginPage ? "p-0" : ""}`}
    >
      {/* Sidebar - Always render to keep hook count stable */}
      <aside
        style={{
          width: isLoginPage ? 0 : isSidebarOpen ? 256 : 80,
          opacity: isLoginPage ? 0 : 1,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className={`border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col relative z-20 ${isLoginPage ? "pointer-events-none invisible" : ""}`}
      >
        <ClientOnly>
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex flex-col items-center justify-center py-8 px-4 overflow-hidden whitespace-nowrap bg-zinc-50/50 dark:bg-zinc-800/30">
              {isSidebarOpen ? (
                <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative group">
                    <Image
                      src="/logo.png"
                      alt="Logo"
                      width={160}
                      height={40}
                      className="relative rounded-lg object-contain"
                      priority
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <h1 className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white flex items-center gap-1">
                      In
                      <span className="text-indigo-600 dark:text-indigo-400">
                        VMS
                      </span>
                    </h1>
                    <div className="h-1 w-8 bg-indigo-500 rounded-full mt-1 opacity-50" />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center p-2 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm dark:border-zinc-700 animate-in zoom-in duration-300">
                  <Image
                    src="/logo2.png"
                    alt="Logo"
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                </div>
              )}
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
              {visibleNavItems.map((item) => {
                const isActive =
                  item.href === "/settings"
                    ? pathname === "/settings"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block relative"
                    title={!isSidebarOpen ? item.label : undefined}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl transition-all duration-300" />
                    )}
                    <div
                      className={`relative flex items-center py-2.5 rounded-xl transition-colors ${
                        isSidebarOpen ? "px-3" : "justify-center"
                      } ${
                        isActive
                          ? "text-indigo-600 dark:text-indigo-400 font-medium"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <item.icon
                        className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                      />
                      {isSidebarOpen && (
                        <span className="whitespace-nowrap overflow-hidden animate-in fade-in slide-in-from-left-1 duration-200">
                          {item.label}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>

            {isValid && daysRemaining !== null && daysRemaining <= 30 && (
              <div className="px-4 py-2">
                <Link
                  href="/settings/license"
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    daysRemaining <= 7
                      ? "bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-900/30"
                      : "bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900/30"
                  }`}
                >
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && (
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                        {t("licenseExpiresIn")}
                      </span>
                      <span className="text-sm font-black whitespace-nowrap">
                        {daysRemaining} {daysRemaining === 1 ? t("day") : t("days")}
                      </span>
                    </div>
                  )}
                </Link>
              </div>
            )}

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2 overflow-hidden">
              <button
                onClick={toggleTheme}
                title={
                  !isSidebarOpen
                    ? theme === "dark"
                      ? t("lightMode")
                      : t("darkMode")
                    : undefined
                }
                className={`flex items-center w-full py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors ${
                  isSidebarOpen ? "px-3" : "justify-center"
                }`}
              >
                {theme === "dark" ? (
                  <Sun
                    className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                  />
                ) : (
                  <Moon
                    className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                  />
                )}
                {isSidebarOpen && (
                  <span className="whitespace-nowrap overflow-hidden animate-in fade-in duration-200">
                    {theme === "dark" ? t("lightMode") : t("darkMode")}
                  </span>
                )}
              </button>
              <button
                onClick={toggleLanguage}
                title={
                  !isSidebarOpen
                    ? language === "en"
                      ? t("thai")
                      : t("english")
                    : undefined
                }
                className={`flex items-center w-full py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors ${
                  isSidebarOpen ? "px-3" : "justify-center"
                }`}
              >
                <Languages
                  className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                />
                {isSidebarOpen && (
                  <span className="whitespace-nowrap overflow-hidden animate-in fade-in duration-200">
                    {language === "en" ? t("thai") : t("english")}
                  </span>
                )}
              </button>
              {user?.role === "guest" ? (
                <button
                  onClick={() => setIsLoginOpen(true)}
                  title={!isSidebarOpen ? t("login") : undefined}
                  className={`flex items-center w-full py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors mt-2 ${
                    isSidebarOpen ? "px-3" : "justify-center"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                  </svg>
                  {isSidebarOpen && (
                    <span className="whitespace-nowrap overflow-hidden font-medium animate-in fade-in duration-200">
                      {t("login")}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={logout}
                  title={!isSidebarOpen ? t("logout") : undefined}
                  className={`flex items-center w-full py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors mt-2 ${
                    isSidebarOpen ? "px-3" : "justify-center"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`flex-shrink-0 ${isSidebarOpen ? "mr-3" : ""}`}
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  {isSidebarOpen && (
                    <span className="whitespace-nowrap overflow-hidden font-medium animate-in fade-in duration-200">
                      {t("logout")}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </ClientOnly>

        {/* Toggle Button */}
        {!isLoginPage && (
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute -right-3 top-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm z-30 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-300 ${isSidebarOpen ? "" : "rotate-180"}`}
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 min-h-0 overflow-y-auto ${
          isLoginPage || pathname === "/monitor" || pathname === "/map"
            ? "p-0"
            : "p-6"
        } ${
          pathname === "/monitor" || pathname === "/map"
            ? "overflow-hidden"
            : ""
        }`}
      >
        <ClientOnly>{children}</ClientOnly>
      </main>
    </div>
  );
}
