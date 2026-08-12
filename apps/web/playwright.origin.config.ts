import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "origin-forwarding.origin.ts",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:33100",
    extraHTTPHeaders: { Origin: "http://127.0.0.1:33100" },
  },
  webServer: [
    {
      command: "PORT=38080 node e2e/origin-forwarding-server.mjs",
      url: "http://127.0.0.1:38080/healthz",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "API_URL=http://127.0.0.1:38080 npm run dev -- --hostname 127.0.0.1 --port 33100",
      url: "http://127.0.0.1:33100/healthz",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
