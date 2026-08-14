import { describe, expect, it } from "vitest";
import { isJsonMediaType } from "./json-media-type";

describe("isJsonMediaType", () => {
  it.each([
    "application/json",
    "Application/JSON",
    " application/json\t",
    "application/json; charset=utf-8",
    'application/json; charset="utf-8"',
    'application/json; profile="https://example.com/json\\\"profile"',
  ])("accepts %s", (value) => {
    expect(isJsonMediaType(value)).toBe(true);
  });

  it.each([
    null,
    "",
    "application/jsonp",
    "application/json-patch+json",
    "text/application/json",
    "application /json",
    "application/json, text/plain",
    "application/json; charset",
    "application/json; charset=",
    'application/json; charset="unterminated',
    'application/json; charset="dangling\\',
  ])("rejects %s", (value) => {
    expect(isJsonMediaType(value)).toBe(false);
  });
});
