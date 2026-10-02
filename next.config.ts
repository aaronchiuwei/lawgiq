import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  // The A/B/C design prototypes are gone; Front Page is the app at "/". Query strings (?role=…) carry over.
  async redirects() {
    return [{ source: "/option-:slug", destination: "/", permanent: false }];
  },
};

export default nextConfig;
