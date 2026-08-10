import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const projectDir = path.dirname(fileURLToPath(import.meta.url));

if (process.env.VERCEL && !process.env.API_URL) {
  throw new Error("API_URL is required on Vercel");
}
const apiUrl = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(projectDir, "../.."),
  rewrites: async () => [
    { source: "/api/v1/:path*", destination: `${apiUrl}/v1/:path*` },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
