import { describe, expect, it } from "vitest";
import { externalRequestOrigin } from "./external-request-origin";

describe("externalRequestOrigin", () => {
  it("preserves the public origin across a backend rewrite", () => {
    const headers = new Headers({
      host: "api.internal:8080",
      "x-forwarded-host": "doindeksa.rs",
      "x-forwarded-proto": "https",
    });

    expect(
      externalRequestOrigin(headers, new URL("http://api.internal:8080")),
    ).toBe("https://doindeksa.rs");
  });

  it("uses the first proxy hop and preserves non-default ports", () => {
    const headers = new Headers({
      "x-forwarded-host": "127.0.0.1:3100, api.internal",
      "x-forwarded-proto": "http, https",
    });

    expect(
      externalRequestOrigin(headers, new URL("http://localhost:3100")),
    ).toBe("http://127.0.0.1:3100");
  });

  it("falls back to the request URL when proxy metadata is malformed", () => {
    const headers = new Headers({
      "x-forwarded-host": "bad host",
      "x-forwarded-proto": "file",
    });

    expect(
      externalRequestOrigin(headers, new URL("https://doindeksa.rs/tasks")),
    ).toBe("https://doindeksa.rs");
  });
});
