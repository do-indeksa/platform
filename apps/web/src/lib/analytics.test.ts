import { describe, expect, it, vi } from "vitest";
import {
  TASK_SOLVED_EVENT,
  trackTaskSolved,
  type AnalyticsTracker,
} from "./analytics";

describe("analytics events", () => {
  it("tracks only the non-identifying solved-task dimensions", () => {
    const track = vi.fn();

    expect(
      trackTaskSolved(
        { source: "practice", position: 4, helpLevel: 2 },
        { track },
      ),
    ).toBe(true);
    expect(track).toHaveBeenCalledWith(TASK_SOLVED_EVENT, {
      source: "practice",
      position: 4,
      helpLevel: 2,
    });
  });

  it("does nothing without a tracker or for malformed dimensions", () => {
    const tracker: AnalyticsTracker = { track: vi.fn() };

    expect(trackTaskSolved({ source: "mock", position: 1 }, undefined)).toBe(
      false,
    );
    expect(trackTaskSolved({ source: "mock", position: 0 }, tracker)).toBe(
      false,
    );
    expect(
      trackTaskSolved(
        { source: "diagnostic", position: 2, helpLevel: 4 },
        tracker,
      ),
    ).toBe(false);
    expect(tracker.track).not.toHaveBeenCalled();
  });

  it("never lets a tracker failure interrupt the learning flow", () => {
    const tracker: AnalyticsTracker = {
      track: () => {
        throw new Error("tracker unavailable");
      },
    };

    expect(
      trackTaskSolved({ source: "diagnostic", position: 7 }, tracker),
    ).toBe(false);
  });
});
