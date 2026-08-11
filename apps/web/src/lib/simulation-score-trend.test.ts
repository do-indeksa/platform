import { describe, expect, it } from "vitest";
import type { SimulationArchiveRun } from "./simulation-archive";
import { buildSimulationScoreTrend } from "./simulation-score-trend";

describe("simulation score trend", () => {
  it("keeps only complete scored 60-point P1 results in chronological order", () => {
    const trend = buildSimulationScoreTrend([
      run("latest", 30, 300),
      run("partial", 54, 400, { answeredCount: 9 }),
      run("pending", null, 500),
      run("different-max", 30, 600, { maxPoints: 30 }),
      run("earliest", 18, 100),
      run("middle", 36, 200),
    ]);

    expect(trend?.points.map(({ id }) => id)).toEqual([
      "earliest",
      "middle",
      "latest",
    ]);
    expect(trend).toMatchObject({
      latest: 30,
      best: 36,
      delta: -6,
      maxPoints: 60,
    });
  });

  it("does not invent a comparison for the first complete result", () => {
    expect(buildSimulationScoreTrend([run("first", 24, 100)])).toMatchObject({
      latest: 24,
      best: 24,
      delta: null,
    });
  });

  it("returns no trend when every result is non-comparable", () => {
    expect(
      buildSimulationScoreTrend([
        run("partial", 24, 100, { answeredCount: 4 }),
        run("pending", null, 200),
      ]),
    ).toBeNull();
  });

  it("bounds the chart to the newest twenty comparable results", () => {
    const entries = Array.from({ length: 23 }, (_, index) =>
      run(`run-${String(index).padStart(2, "0")}`, index, index + 1),
    );

    const trend = buildSimulationScoreTrend(entries);

    expect(trend?.points).toHaveLength(20);
    expect(trend?.points[0].id).toBe("run-03");
    expect(trend?.points.at(-1)?.id).toBe("run-22");
    expect(trend).toMatchObject({ latest: 22, best: 22, delta: 1 });
  });
});

function run(
  id: string,
  score: number | null,
  finishedAt: number,
  overrides: Partial<SimulationArchiveRun> = {},
): SimulationArchiveRun {
  const taskIds = Array.from({ length: 10 }, (_, index) => `task-${index + 1}`);
  return {
    id,
    blueprintVersion: "2026.1",
    startedAt: finishedAt - 1,
    finishedAt,
    durationMs: 1,
    timedOut: false,
    score,
    maxPoints: 60,
    correctCount: score === null ? 0 : Math.floor(score / 6),
    answeredCount: 10,
    taskIds,
    outcomes: taskIds.map(() => "incorrect"),
    historyEntry: null,
    ...overrides,
  };
}
