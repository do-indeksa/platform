import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, webSecurityHeaders } from "./security-headers";

describe("webSecurityHeaders", () => {
  it("defines a production browser boundary without development execution", () => {
    const headers = new Map(
      webSecurityHeaders(false).map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const policy = headers.get("content-security-policy");

    expect(policy).toContain("default-src 'self';");
    expect(policy).toContain("script-src-attr 'none';");
    expect(policy).toContain("frame-ancestors 'none';");
    expect(policy).toContain("upgrade-insecure-requests;");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("allows the execution and connection transports required by development", () => {
    const policy = contentSecurityPolicy(true);
    const headers = new Map(
      webSecurityHeaders(true).map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );

    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https: http: 'unsafe-eval';",
    );
    expect(policy).toContain("connect-src 'self' https: http: ws: wss:;");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(headers.has("strict-transport-security")).toBe(false);
  });

  it("emits unique single-line headers", () => {
    const headers = webSecurityHeaders(false);
    const names = headers.map(({ key }) => key.toLowerCase());

    expect(new Set(names).size).toBe(names.length);
    for (const { key, value } of headers) {
      expect(key).not.toMatch(/[\r\n]/);
      expect(value).not.toMatch(/[\r\n]/);
    }
  });
});
