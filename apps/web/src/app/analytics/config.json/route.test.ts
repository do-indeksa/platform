import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const websiteId = "94db1cb1-74f4-4a40-ad6c-962362670409";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics config route", () => {
  it("fails closed when runtime configuration is incomplete", async () => {
    stubAnalyticsEnv({ scriptUrl: "", websiteId: "", domains: "" });

    const response = GET();

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("");
  });

  it("returns normalized runtime configuration as JSON data", async () => {
    stubAnalyticsEnv({
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId: websiteId.toUpperCase(),
      domains: "do-indeksa.rs, www.do-indeksa.rs,do-indeksa.rs",
    });

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    await expect(response.json()).resolves.toEqual({
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId,
      domains: "do-indeksa.rs,www.do-indeksa.rs",
    });
  });

  it.each([
    { scriptUrl: "javascript:alert(1)", websiteId, domains: "do-indeksa.rs" },
    {
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId: "not-a-uuid",
      domains: "do-indeksa.rs",
    },
    {
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId,
      domains: '</script><script>alert("injected")</script>',
    },
  ])("returns no data for adversarial configuration: %o", async (input) => {
    stubAnalyticsEnv(input);

    const response = GET();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

function stubAnalyticsEnv(input: {
  scriptUrl: string;
  websiteId: string;
  domains: string;
}) {
  vi.stubEnv("UMAMI_SCRIPT_URL", input.scriptUrl);
  vi.stubEnv("UMAMI_WEBSITE_ID", input.websiteId);
  vi.stubEnv("UMAMI_DOMAINS", input.domains);
}
