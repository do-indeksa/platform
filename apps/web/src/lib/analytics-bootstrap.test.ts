import { describe, expect, it, vi } from "vitest";
import { buildAnalyticsBootstrap } from "./analytics-bootstrap";

const config = {
  scriptUrl: "https://analytics.example.com/script.js",
  websiteId: "94db1cb1-74f4-4a40-ad6c-962362670409",
  domains: "do-indeksa.example.com",
};

describe("analytics bootstrap", () => {
  it("loads the validated tracker with privacy controls", () => {
    const script = { dataset: {} } as {
      id?: string;
      defer?: boolean;
      src?: string;
      dataset: Record<string, string>;
    };
    const appendChild = vi.fn();
    const document = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild },
    };

    new Function("document", buildAnalyticsBootstrap(config))(document);

    expect(script).toMatchObject({
      id: "umami-analytics",
      defer: true,
      src: config.scriptUrl,
      dataset: {
        websiteId: config.websiteId,
        domains: config.domains,
        doNotTrack: "true",
        excludeSearch: "true",
        excludeHash: "true",
      },
    });
    expect(appendChild).toHaveBeenCalledOnce();
  });

  it("does not install the tracker twice", () => {
    const document = {
      getElementById: vi.fn(() => ({})),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    };

    new Function("document", buildAnalyticsBootstrap(config))(document);

    expect(document.createElement).not.toHaveBeenCalled();
    expect(document.head.appendChild).not.toHaveBeenCalled();
  });
});
