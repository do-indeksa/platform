import { describe, expect, it } from "vitest";
import {
  LEVEL_MIN_ATTEMPTS,
  MASTERY_WINDOW,
  masteryLevel,
  slotMastery,
  type Attempt,
} from "./knowledge";

function attempt(slot: number, correct: boolean, i = 0): Attempt {
  return {
    taskId: `t-${slot}-${i}`,
    slot,
    correct,
    source: "practice",
    at: new Date(2026, 0, 1, 0, i).toISOString(),
  };
}

describe("slotMastery", () => {
  it("returns null without attempts for the slot", () => {
    expect(slotMastery([attempt(2, true)], 1)).toBeNull();
  });

  it.each([
    {
      name: "single attempt",
      attempts: [attempt(1, true)],
      expected: { correct: 1, total: 1, ratio: 1 },
    },
    {
      name: "mixed results",
      attempts: [attempt(1, true), attempt(1, false)],
      expected: { correct: 1, total: 2, ratio: 0.5 },
    },
    {
      name: "other slots ignored",
      attempts: [attempt(1, false), attempt(2, true), attempt(1, true)],
      expected: { correct: 1, total: 2, ratio: 0.5 },
    },
  ])("$name → $expected", ({ attempts, expected }) => {
    expect(slotMastery(attempts, 1)).toEqual(expected);
  });

  it(`keeps only the last ${MASTERY_WINDOW} attempts`, () => {
    const attempts = [
      attempt(1, false, 1),
      attempt(1, false, 2),
      ...Array.from({ length: MASTERY_WINDOW }, (_, i) =>
        attempt(1, true, 10 + i),
      ),
    ];
    expect(slotMastery(attempts, 1)).toEqual({
      correct: MASTERY_WINDOW,
      total: MASTERY_WINDOW,
      ratio: 1,
    });
  });
});

describe("masteryLevel", () => {
  it(`withholds a level below ${LEVEL_MIN_ATTEMPTS} attempts`, () => {
    expect(masteryLevel({ correct: 2, total: 2, ratio: 1 })).toBeNull();
  });

  it.each([
    { correct: 0, total: 3, ratio: 0, expected: "weak" },
    { correct: 1, total: 3, ratio: 1 / 3, expected: "weak" },
    { correct: 2, total: 4, ratio: 0.5, expected: "medium" },
    { correct: 3, total: 4, ratio: 0.75, expected: "medium" },
    { correct: 4, total: 5, ratio: 0.8, expected: "strong" },
    { correct: 5, total: 5, ratio: 1, expected: "strong" },
  ])("$correct/$total → $expected", ({ expected, ...mastery }) => {
    expect(masteryLevel(mastery)).toBe(expected);
  });
});
