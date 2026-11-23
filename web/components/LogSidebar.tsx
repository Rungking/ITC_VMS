"use client";

import React, { useState, useEffect, useRef } from "react";
import { ScrollText, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/providers";
import { subscribeToLogs, addLog, LogEntry } from "@/lib/logs";

export function LogSidebar() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const unsub = subscribeToLogs((entry) => {
      setLogs((prev) => [...prev.slice(-199), entry]);
    });

    if (!initialized.current) {
      initialized.current = true;
      addLog(t("systemStarted"), "info");
    }

    return unsub;
  }, [t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <ScrollText className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium">{t("logs")}</span>
        </div>
        <button
          onClick={() => setLogs([])}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title={t("clearLogs")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-center text-zinc-400 py-4">{t("noLogs")}</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start space-x-2">
              <span className="text-zinc-400 flex-shrink-0 tabular-nums">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span
                className={
                  log.type === "error"
                    ? "text-rose-400"
                    : log.type === "warn"
                      ? "text-amber-400"
                      : "text-zinc-600 dark:text-zinc-300"
                }
              >
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
