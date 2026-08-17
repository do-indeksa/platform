import { describe, expect, it, vi } from "vitest";
import { analyticsBootstrap } from "./analytics-bootstrap";

const config = {
  scriptUrl: "https://analytics.example.com/script.js",
  websiteId: "94db1cb1-74f4-4a40-ad6c-962362670409",
  domains: "do-indeksa.example.com",
};

describe("analytics bootstrap", () => {
  it("loads validated data with the existing privacy controls", async () => {
    const context = analyticsDocument();
    const fetch = vi.fn().mockResolvedValue(configResponse(config));

    runBootstrap(context.document, fetch);

    await vi.waitFor(() => expect(context.appendChild).toHaveBeenCalledOnce());

    expect(fetch).toHaveBeenCalledWith("/analytics/config.json", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    expect(context.script).toMatchObject({
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
  });

  it("does not install the tracker twice", () => {
    const context = analyticsDocument(true);
    const fetch = vi.fn();

    runBootstrap(context.document, fetch);

    expect(fetch).not.toHaveBeenCalled();
    expect(context.createElement).not.toHaveBeenCalled();
    expect(context.appendChild).not.toHaveBeenCalled();
  });

  it("installs once when two bootstrap requests resolve together", async () => {
    const context = analyticsDocument();
    const fetch = vi.fn(() => Promise.resolve(configResponse(config)));

    runBootstrap(context.document, fetch);
    runBootstrap(context.document, fetch);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(context.appendChild).toHaveBeenCalledOnce());
    expect(context.createElement).toHaveBeenCalledOnce();
  });

  it.each([
    ["disabled", new Response(null, { status: 204 })],
    [
      "wrong MIME",
      new Response(JSON.stringify(config), {
        status: 200,
        headers: { "content-type": "application/jsonp" },
      }),
    ],
    [
      "unsafe source",
      configResponse({ ...config, scriptUrl: "javascript:alert(1)" }),
    ],
    ["invalid JSON", new Response("{", { headers: jsonHeaders })],
  ])("fails closed for a %s response", async (_name, response) => {
    const context = analyticsDocument();
    const fetch = vi.fn().mockResolvedValue(response);

    runBootstrap(context.document, fetch);
    await settleBootstrap();

    expect(context.createElement).not.toHaveBeenCalled();
    expect(context.appendChild).not.toHaveBeenCalled();
  });

  it("fails closed when the configuration request fails", async () => {
    const context = analyticsDocument();
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));

    runBootstrap(context.document, fetch);
    await settleBootstrap();

    expect(context.createElement).not.toHaveBeenCalled();
    expect(context.appendChild).not.toHaveBeenCalled();
  });
});

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function configResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: jsonHeaders,
  });
}

function analyticsDocument(installed = false) {
  const script = { dataset: {} } as {
    id?: string;
    defer?: boolean;
    src?: string;
    dataset: Record<string, string>;
  };
  let hasTracker = installed;
  const appendChild = vi.fn(() => {
    hasTracker = true;
  });
  const createElement = vi.fn(() => script);
  const document = {
    getElementById: vi.fn(() => (hasTracker ? script : null)),
    createElement,
    head: { appendChild },
  };
  return { appendChild, createElement, document, script };
}

function runBootstrap(
  document: ReturnType<typeof analyticsDocument>["document"],
  fetch: ReturnType<typeof vi.fn>,
) {
  new Function("document", "fetch", analyticsBootstrap)(document, fetch);
}

async function settleBootstrap() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
