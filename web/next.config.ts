import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Keep visited (and prefetched) app screens in the router cache, so
    // switching tabs doesn't wait for the server each time. Data freshness is
    // the client data cache's job (lib/api/query-client.ts).
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      {
        // Everything but the landing page (/) stays out of search engines.
        source: "/:path+",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // The service worker must never be served stale, or a fix to it can
        // take days to reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
}

export default nextConfig
