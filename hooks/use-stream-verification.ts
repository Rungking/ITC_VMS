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
      const timeoutId = setTimeout(() => controller.abort(), 8000); // เพิ่ม Timeout เป็น 8 วินาที
      try {
        // ใช้ fetch เช็คการเข้าถึงได้ของ URL 
        // เพิ่มพารามิเตอร์ random เพื่อป้องกัน browser cache ผลลัพธ์เดิม
        const sep = streamUrl.includes('?') ? '&' : '?';
        const checkUrl = `${streamUrl}${sep}t=${Date.now()}`;

        await fetch(checkUrl, {
          method: "GET",
          mode: "no-cors",
          signal: controller.signal,
          cache: "no-store",
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!cancelled) setStatus("active");
      } catch (err) {
        // ถ้าเป็น AbortError (timeout) ให้พยายามรักษาสถานะเดิมไว้ก่อน ไม่รีบตัดสินว่าเป็น offline
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn("Stream check timeout, keeping current status");
          return;
        }
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
