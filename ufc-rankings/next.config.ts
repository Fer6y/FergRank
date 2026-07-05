import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 locks the dist dir per dev server; overriding it lets a second
  // dev instance (e.g. an isolated preview) run against the same checkout.
  distDir: process.env.NEXT_DIST_DIR || undefined,

  // Fighter photos come from UFC.com + Wikimedia Commons (see fighterMedia.ts).
  // Allowlisted so next/image can optimize/resize them (a full UFC headshot is
  // served into a ~40px avatar — a big transfer saving across 40-row rankings).
  // Both the src host and its redirect target are listed: the stored URLs use
  // ufc.com / commons.wikimedia.org, which 301 to www.ufc.com / upload.wikimedia
  // — the optimizer follows redirects, but the pattern is matched on the src.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ufc.com' },
      { protocol: 'https', hostname: 'www.ufc.com' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
};

export default nextConfig;
