import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics bootstrap route", () => {
  it("fails closed when runtime configuration is incomplete", async () => {
    vi.stubEnv("UMAMI_SCRIPT_URL", "");
    vi.stubEnv("UMAMI_WEBSITE_ID", "");
    vi.stubEnv("UMAMI_DOMAINS", "");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    expect(await response.text()).toBe("");
  });

  it("renders a validated runtime configuration", async () => {
    vi.stubEnv("UMAMI_SCRIPT_URL", "https://analytics.example.com/script.js");
    vi.stubEnv("UMAMI_WEBSITE_ID", "94DB1CB1-74F4-4A40-AD6C-962362670409");
    vi.stubEnv("UMAMI_DOMAINS", "do-indeksa.example.com");

    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    expect(body).toContain("94db1cb1-74f4-4a40-ad6c-962362670409");
    expect(body).toContain("doNotTrack");
  });
});
