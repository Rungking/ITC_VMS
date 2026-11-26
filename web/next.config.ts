import type { NextConfig } from "next";

// Where the FastAPI backend listens. In production the reverse proxy routes /api instead (B-07).
const backend = process.env.VMS_BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image (see Dockerfile).
  output: "standalone",
  async rewrites() {
    // Applied after Next's own routes, so the old app/api/zm route still answers until W-03 removes it.
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
