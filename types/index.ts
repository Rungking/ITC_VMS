export interface Camera {
  id: string;
  name: string;
  port?: number;
  framerate: number;
  streamUrl?: string; // full stream URL (e.g. ZoneMinder nph-zms)
  status?: "active" | "inactive" | "checking";
  type?: string;
  path?: string;
  lat?: number;
  lng?: number;
  location?: string;
  model?: string;
}
