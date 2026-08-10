import { describe, expect, it } from "vitest";
import { parseAnalyticsConfig } from "./analytics-config";

const websiteId = "94db1cb1-74f4-4a40-ad6c-962362670409";

describe("analytics config", () => {
  it("accepts a secure self-hosted tracker and normalizes its domains", () => {
    expect(
      parseAnalyticsConfig({
        scriptUrl: "https://analytics.example.com/script.js",
        websiteId: websiteId.toUpperCase(),
        domains: "do-indeksa.rs, www.do-indeksa.rs,do-indeksa.rs",
      }),
    ).toEqual({
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId,
      domains: "do-indeksa.rs,www.do-indeksa.rs",
    });
  });

  it("supports a same-origin proxy and local development", () => {
    expect(
      parseAnalyticsConfig({
        scriptUrl: "/stats/script.js",
        websiteId,
        domains: "do-indeksa.test",
      }),
    ).toEqual({
      scriptUrl: "/stats/script.js",
      websiteId,
      domains: "do-indeksa.test",
    });
    expect(
      parseAnalyticsConfig({
        scriptUrl: "http://localhost:3000/script.js",
        websiteId,
        domains: "localhost,127.0.0.1",
      }),
    ).toEqual({
      scriptUrl: "http://localhost:3000/script.js",
      websiteId,
      domains: "localhost,127.0.0.1",
    });
  });

  it.each([
    {},
    { scriptUrl: "https://analytics.example.com/script.js" },
    { scriptUrl: "https://analytics.example.com/script.js", websiteId },
    { scriptUrl: "http://analytics.example.com/script.js", websiteId },
    { scriptUrl: "https://user:secret@example.com/script.js", websiteId },
    {
      scriptUrl: "https://analytics.example.com/script.js#fragment",
      websiteId,
    },
    { scriptUrl: "https://analytics.example.com/script.js", websiteId: "bad" },
    {
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId,
      domains: "https://do-indeksa.rs",
    },
  ])("fails closed for incomplete or malformed input: %o", (input) => {
    expect(parseAnalyticsConfig(input)).toBeNull();
  });
});
