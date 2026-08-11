import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const visualBaseUrl = "http://localhost:3100";

export default defineConfig({
  ...baseConfig,
  testMatch: "**/*.visual.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "test-results/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    },
  },
  use: {
    ...baseConfig.use,
    baseURL: visualBaseUrl,
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    locale: "sr-Latn-RS",
    timezoneId: "Europe/Belgrade",
  },
  webServer: {
    command: process.env.CI
      ? "HOSTNAME=:: PORT=3100 npm start"
      : "npm run build && HOSTNAME=:: PORT=3100 npm start",
    url: `${visualBaseUrl}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
