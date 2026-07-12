import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Self-hosted behind Caddy on :3010 (gotcha #9): node .next/standalone/apps/web/server.js
  output: "standalone",
  // Monorepo: trace files from the workspace root or the standalone bundle misses hoisted deps.
  outputFileTracingRoot: join(import.meta.dirname, "../../"),
  images: {
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
};

export default nextConfig;
