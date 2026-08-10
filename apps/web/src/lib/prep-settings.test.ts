import { describe, expect, it } from "vitest";
import { parsePrepPreferences } from "./prep-settings";

describe("parsePrepPreferences", () => {
  it("accepts a valid score goal and calendar date", () => {
    expect(
      parsePrepPreferences({ goalPoints: 42, examDate: "2027-06-28" }),
    ).toEqual({ goalPoints: 42, examDate: "2027-06-28" });
  });

  it("drops malformed, out-of-range and impossible values", () => {
    expect(
      parsePrepPreferences({ goalPoints: 61, examDate: "2027-02-30" }),
    ).toEqual({ goalPoints: null, examDate: null });
    expect(parsePrepPreferences("not-an-object")).toEqual({
      goalPoints: null,
      examDate: null,
    });
  });
});
