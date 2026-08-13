import { describe, expect, it } from "vitest";
import { createPracticeActiveClock } from "./practice-active-clock";

describe("practice active clock", () => {
  it("counts only active monotonic time", () => {
    let now = 1_000;
    const clock = createPracticeActiveClock(5_000, true, () => now);

    now += 2_500;
    expect(clock.read()).toBe(7_500);
    expect(clock.pause()).toBe(7_500);
    now += 20_000;
    expect(clock.read()).toBe(7_500);
    expect(clock.resume()).toBe(7_500);
    now += 500;
    expect(clock.read()).toBe(8_000);
  });

  it("starts paused without inventing elapsed time", () => {
    let now = 10_000;
    const clock = createPracticeActiveClock(3_000, false, () => now);

    now += 1_000;
    expect(clock.read()).toBe(3_000);
    clock.resume();
    now += 250;
    expect(clock.read()).toBe(3_250);
  });
});
