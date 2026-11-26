export interface Camera {
  id: string;
  name: string;
  port?: number | string;
  framerate?: number;
  streamUrl?: string; // full stream URL (e.g. ZoneMinder nph-zms)
  status?: "active" | "inactive" | "checking" | "connected";
  type?: string;
  brand?: string;
  path?: string;
  lat?: number;
  lng?: number;
  location?: string;
  model?: string;
  ip?: string;
  ipAddress?: string;
  zmId?: string | number;
  channel?: string | number;
  subtype?: string | number;
  ports?: string | number;
  function?: string;
  method?: string;
  width?: string | number;
  height?: string | number;
  colours?: string | number;
  username?: string;
  password?: string;
  parentId?: string;
  parentPort?: number;
  connectionType?: string;
  topoX?: number | null;
  topoY?: number | null;
  deviceName?: string; // NVR/camera this channel belongs to (ITC VMS backend)
}
