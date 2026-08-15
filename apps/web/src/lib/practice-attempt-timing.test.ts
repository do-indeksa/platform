import { describe, expect, it } from "vitest";
import { createPracticeAttemptTiming } from "./practice-attempt-timing";

describe("practice attempt timing", () => {
  it("keeps retry timestamps strictly increasing at millisecond precision", () => {
    expect(
      createPracticeAttemptTiming(
        { startedAt: 10_000, runActiveDurationMs: 2_000 },
        10_000,
        2_000,
        "active",
      ),
    ).toEqual({
      startedAt: 10_000,
      submittedAt: 10_001,
      activeDurationMs: 0,
      runActiveDurationMs: 2_000,
    });
  });

  it("uses monotonic active time for a durable run", () => {
    expect(
      createPracticeAttemptTiming(
        { startedAt: 10_000, runActiveDurationMs: 2_000 },
        30_000,
        4_500,
        "active",
      ).activeDurationMs,
    ).toBe(2_500);
  });

  it("keeps wall time for a legacy practice without an active clock", () => {
    expect(
      createPracticeAttemptTiming(
        { startedAt: 10_000, runActiveDurationMs: 0 },
        30_000,
        0,
        "wall",
      ).activeDurationMs,
    ).toBe(20_000);
  });
});
