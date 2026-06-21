"use client";

import { useState, useEffect } from "react";

type StreamStatus = "checking" | "active" | "inactive";

export function useStreamVerification(streamUrl: string | null) {
  const [status, setStatus] = useState<StreamStatus>("checking");

  useEffect(() => {
    if (!streamUrl) {
      setStatus("inactive");
      return;
    }

    setStatus("checking");
    let cancelled = false;

    const check = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        // Use a lightweight HEAD request to check connectivity
        // Extract the base host from the stream URL to ping
        const url = new URL(streamUrl);
        const pingUrl = `${url.protocol}//${url.host}/zm/api/host/getVersion.json`;

        await fetch(pingUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!cancelled) setStatus("active");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return; // timeout — keep current status
        if (!cancelled) setStatus("inactive");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    check();
    const interval = setInterval(check, 30000); // check every 30s instead of 15s

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [streamUrl]);

  return { status };
}
