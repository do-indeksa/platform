import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { webSecurityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin();
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);

if (isVercel && !process.env.API_URL) {
  throw new Error("API_URL is required on Vercel");
}
const apiUrl = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(isVercel
    ? {}
    : {
        output: "standalone" as const,
        outputFileTracingRoot: path.resolve(projectDir, "../.."),
      }),
  headers: async () => [
    {
      source: "/:path*",
      headers: webSecurityHeaders(process.env.NODE_ENV === "development"),
    },
  ],
  rewrites: async () => [
    { source: "/api/v1/:path*", destination: `${apiUrl}/v1/:path*` },
    { source: "/graphql", destination: `${apiUrl}/graphql` },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
