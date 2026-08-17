import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsBootstrap } from "../../../lib/analytics-bootstrap";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics bootstrap route", () => {
  it("serves fixed JavaScript with no-store security headers", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/javascript; charset=utf-8",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe(analyticsBootstrap);
  });

  it("never interpolates runtime configuration into executable source", async () => {
    const codeShapedValue = '</script><script>alert("injected")</script>';
    vi.stubEnv("UMAMI_SCRIPT_URL", codeShapedValue);
    vi.stubEnv("UMAMI_WEBSITE_ID", codeShapedValue);
    vi.stubEnv("UMAMI_DOMAINS", codeShapedValue);

    const response = GET();
    const body = await response.text();

    expect(body).toBe(analyticsBootstrap);
    expect(body).not.toContain(codeShapedValue);
  });
});
