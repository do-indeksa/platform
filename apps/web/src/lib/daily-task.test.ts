import { describe, expect, it } from "vitest";
import type { Attempt } from "./knowledge";
import {
  dailyTaskDayKey,
  isDailyTaskComplete,
  selectDailyTask,
  studyDayStreak,
} from "./daily-task";

describe("daily task", () => {
  it("changes the study day at midnight in Belgrade", () => {
    expect(dailyTaskDayKey(new Date("2026-08-10T21:59:59.000Z"))).toBe(
      "2026-08-10",
    );
    expect(dailyTaskDayKey(new Date("2026-08-10T22:00:00.000Z"))).toBe(
      "2026-08-11",
    );
    expect(dailyTaskDayKey(new Date("2026-01-01T22:59:59.000Z"))).toBe(
      "2026-01-01",
    );
    expect(dailyTaskDayKey(new Date("2026-01-01T23:00:00.000Z"))).toBe(
      "2026-01-02",
    );
  });

  it("selects the same task regardless of input order", () => {
    const date = new Date("2026-08-10T12:00:00.000Z");
    const tasks = [{ id: "task-c" }, { id: "task-a" }, { id: "task-b" }];

    expect(selectDailyTask(tasks, date)?.id).toBe(
      selectDailyTask(tasks.toReversed(), date)?.id,
    );
    expect(selectDailyTask([], date)).toBeNull();
  });

  it("marks only a correct attempt on today's featured task complete", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const attempts = [
      attempt("task-a", false, "2026-08-10T08:00:00.000Z"),
      attempt("task-a", true, "2026-08-09T08:00:00.000Z"),
      attempt("task-b", true, "2026-08-10T09:00:00.000Z"),
    ];

    expect(isDailyTaskComplete(attempts, "task-a", now)).toBe(false);
    expect(
      isDailyTaskComplete(
        [...attempts, attempt("task-a", true, "2026-08-10T10:00:00.000Z")],
        "task-a",
        now,
      ),
    ).toBe(true);
  });

  it("keeps an active streak through today or yesterday and stops at gaps", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const priorDays = [
      attempt("task-a", true, "2026-08-08T10:00:00.000Z"),
      attempt("task-b", true, "2026-08-09T10:00:00.000Z"),
      attempt("task-c", false, "2026-08-10T10:00:00.000Z"),
    ];

    expect(studyDayStreak(priorDays, now)).toBe(2);
    expect(
      studyDayStreak(
        [...priorDays, attempt("task-c", true, "2026-08-10T11:00:00.000Z")],
        now,
      ),
    ).toBe(3);
    expect(
      studyDayStreak(
        [attempt("task-a", true, "2026-08-07T10:00:00.000Z")],
        now,
      ),
    ).toBe(0);
  });
});

function attempt(taskId: string, correct: boolean, at: string): Attempt {
  return {
    taskId,
    slot: 1,
    correct,
    source: "practice",
    helpLevel: 0,
    at,
  };
}
