import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@roast/domain"],
  poweredByHeader: false,
  devIndicators: false,
  // The shared sheet is ~16 KB compressed. Inline it for a faster first paint
  // on slow connections; validate production navigation when upgrading Next.
  experimental: { inlineCss: true },
  webpack(webpackConfig) {
    webpackConfig.resolve.alias["@"] = path.resolve(process.cwd(), "src");
    return webpackConfig;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
