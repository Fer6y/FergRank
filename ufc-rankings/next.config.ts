import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 locks the dist dir per dev server; overriding it lets a second
  // dev instance (e.g. an isolated preview) run against the same checkout.
  distDir: process.env.NEXT_DIST_DIR || undefined,
};

export default nextConfig;
