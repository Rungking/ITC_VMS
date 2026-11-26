// Client for the ITC VMS backend (FastAPI). In development Next.js forwards /api/* to the backend
// (next.config.ts rewrites); in production the reverse proxy does (B-07).
import { Camera } from "@/types";

export interface BackendCamera {
  id: number;
  device_id: number;
  channel: number;
  name: string;
  enabled: boolean;
  has_ai: boolean;
  lat: number | null;
  lng: number | null;
  location_name: string;
  device: {
    id: number;
    name: string;
    vendor: string;
    kind: "nvr" | "camera";
    host: string;
    model: string;
    is_online: boolean;
  };
}

export interface StreamInfo {
  path: string;
  whep_url: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

const VENDOR_LABEL: Record<string, string> = { dahua: "Dahua", hikvision: "Hikvision" };

/** Map a backend camera to the shape the existing screens (map, monitor, dashboard) already use. */
export function toUiCamera(c: BackendCamera): Camera {
  return {
    id: String(c.id),
    name: c.name,
    type: "IPC",
    brand: VENDOR_LABEL[c.device.vendor] ?? c.device.vendor,
    model: c.device.model,
    ip: c.device.host,
    ipAddress: c.device.host,
    channel: c.channel,
    lat: c.lat ?? undefined,
    lng: c.lng ?? undefined,
    location: c.location_name,
    status: c.enabled && c.device.is_online ? "active" : "inactive",
    deviceName: c.device.name,
  };
}

export const api = {
  cameras: () => request<BackendCamera[]>("/api/cameras"),

  updateCamera: (id: string | number, body: { lat?: number | null; lng?: number | null; location_name?: string }) =>
    request<BackendCamera>(`/api/cameras/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  live: (id: string | number, stream: "main" | "sub" = "sub") =>
    request<StreamInfo>(`/api/cameras/${id}/live?stream=${stream}`),

  /** start/end are the NVR's local time, "YYYY-MM-DDTHH:mm:ss" (no timezone). */
  playback: (id: string | number, start: string, end: string) =>
    request<StreamInfo>(`/api/cameras/${id}/playback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    }),
};
