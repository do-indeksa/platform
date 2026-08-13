import { describe, expect, it } from "vitest";
import { playwrightPort } from "./playwright.config";

describe("Playwright port", () => {
  it("uses the stable default and accepts an isolated local port", () => {
    expect(playwrightPort(undefined)).toBe(3100);
    expect(playwrightPort("3410")).toBe(3410);
  });

  it.each(["", "0", "65536", "1.5", "invalid"])(
    "rejects invalid value %j",
    (value) => {
      expect(() => playwrightPort(value)).toThrow(
        "PLAYWRIGHT_PORT must be a valid TCP port",
      );
    },
  );
});
