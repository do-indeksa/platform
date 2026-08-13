import { defineConfig, devices } from "@playwright/test";

const port = playwrightPort(process.env.PLAYWRIGHT_PORT);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? `PORT=${port} npm start`
      : `npm run build && PORT=${port} npm start`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

export function playwrightPort(value: string | undefined): number {
  if (value === undefined) return 3100;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("PLAYWRIGHT_PORT must be a valid TCP port");
  }
  return port;
}
