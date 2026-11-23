"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { User, Lock, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

export function LoginDialog() {
  const { t } = useTranslation();
  const { login, isLoginOpen, setIsLoginOpen } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.user.username, data.user.role, data.user.id, data.user.name);
        setIsLoginOpen(false);
        setUsername("");
        setPassword("");
      } else {
        const errorData = await res.json();
        setError(errorData.error || t("invalidCredentials"));
      }
    } catch {
      setError(t("loginError"));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoginOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden relative border border-zinc-200 dark:border-zinc-800"
        >
          <button
            onClick={() => setIsLoginOpen(false)}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                {t("signIn")}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                {t("authenticationRequired")}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm rounded-xl text-center font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
                  {t("username")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    placeholder={t("enterUsername")}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
                  {t("password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    placeholder={t("enterPassword")}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("signIn")}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
