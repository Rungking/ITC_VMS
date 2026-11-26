"use client";

// Plays a MediaMTX path over WebRTC (WHEP). The backend tells us the WHEP URL; the browser never
// talks to the camera or NVR, and the device password never reaches the browser.
import React, { useEffect, useRef, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { StreamInfo } from "@/lib/api";

type State = "connecting" | "playing" | "error";

async function startWhep(whepUrl: string, video: HTMLVideoElement): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  // Collect tracks ourselves: with a video-only source (e.g. a camera without audio) the browser may deliver
  // the track without an associated stream, so `ev.streams[0]` can be undefined.
  const stream = new MediaStream();
  pc.ontrack = (ev) => {
    stream.addTrack(ev.track);
    if (video.srcObject !== stream) video.srcObject = stream;
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // Wait briefly for ICE candidates so a single request carries them (MediaMTX accepts non-trickle offers).
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => pc.iceGatheringState === "complete" && resolve();
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 1500);
  });
  const res = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? offer.sdp,
  });
  if (!res.ok) {
    pc.close();
    throw new Error(res.status === 404 ? "ไม่มีภาพจากกล้อง (path ไม่พร้อม)" : `WHEP HTTP ${res.status}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  return pc;
}

/**
 * `load` asks the backend for the stream (live or playback); it is called again on "retry".
 * Pass a new `reloadKey` to restart with the same loader (e.g. a new playback time).
 */
export function LivePlayer({
  load,
  reloadKey,
  className = "",
  muted = true,
}: {
  load: () => Promise<StreamInfo>;
  reloadKey?: string | number;
  className?: string;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const [state, setState] = useState<State>("connecting");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const video = videoRef.current;
    if (!video) return;

    setState("connecting");
    (async () => {
      try {
        const info = await loadRef.current();
        if (cancelled) return;
        pc = await startWhep(info.whep_url, video);
        if (cancelled) return pc.close();
        pc.onconnectionstatechange = () => {
          if (!pc) return;
          if (pc.connectionState === "connected") setState("playing");
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setState("error");
            setError("การเชื่อมต่อภาพหลุด กำลังลองใหม่...");
            retryTimer = setTimeout(() => setAttempt((a) => a + 1), 5000);
          }
        };
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      pc?.close();
      if (video) video.srcObject = null;
    };
  }, [reloadKey, attempt]);

  return (
    // Positioning comes from the caller (e.g. "absolute inset-0"); never add "relative" next to it, or the two
    // classes fight and the player collapses to 0x0 while video is still decoding.
    <div className={`bg-black ${/\b(absolute|fixed|relative|sticky)\b/.test(className) ? className : `relative ${className}`}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="absolute inset-0 w-full h-full object-contain"
        onPlaying={() => setState("playing")}
      />
      {state === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-zinc-400">
          <WifiOff className="w-7 h-7 opacity-40" />
          <span className="text-xs">{error}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAttempt((a) => a + 1);
            }}
            className="text-xs px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  );
}
