export interface Camera {
  id: string;
  name: string;
  port?: number;
  framerate: number;
  streamUrl?: string; // full stream URL (e.g. ZoneMinder nph-zms)
}
