import { describe, expect, it } from "vitest";
import { schoolPoints, totalScore } from "./scoring";

describe("schoolPoints", () => {
  it.each([
    { averages: [5, 5, 5, 5], expected: 40 },
    { averages: [2, 2, 2, 2], expected: 16 },
    { averages: [4.5, 4.75, 5, 4.25], expected: 37 },
    { averages: [3.33, 4.17, 4.5, 3.8], expected: 31.6 },
  ])("$averages → $expected", ({ averages, expected }) => {
    expect(schoolPoints(averages)).toBeCloseTo(expected, 10);
  });
});

describe("totalScore", () => {
  it.each([
    { averages: [5, 5, 5, 5], exam: 60, expected: 100 },
    { averages: [2, 2, 2, 2], exam: 0, expected: 16 },
    { averages: [4.8, 4.9, 5, 4.7], exam: 45, expected: 83.8 },
    { averages: [4.5, 4.5, 4.5, 4.5], exam: 30.5, expected: 66.5 },
  ])("$averages + $exam → $expected", ({ averages, exam, expected }) => {
    expect(totalScore(averages, exam)).toBeCloseTo(expected, 10);
  });
});
