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
        await fetch(streamUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!cancelled) setStatus("active");
      } catch {
        if (!cancelled) setStatus("inactive");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    check();
    const interval = setInterval(check, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [streamUrl]);

  return { status };
}
