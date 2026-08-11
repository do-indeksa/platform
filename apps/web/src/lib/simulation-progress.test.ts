import { describe, expect, it } from "vitest";
import { progressAttemptId, progressRunItemId } from "./progress-run";
import { buildCompletedSimulationRun } from "./simulation-progress";
import type { SimulationHistoryEntry } from "./simulation-types";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.UTC(2026, 7, 10, 10);

function historyEntry(): SimulationHistoryEntry {
  const taskIds = Array.from({ length: 10 }, (_, index) => `task-${index + 1}`);
  const outcomes = [
    "correct",
    "incorrect",
    ...Array<"unanswered">(8).fill("unanswered"),
  ] as const;
  return {
    id: runId,
    blueprintVersion: "2026.1",
    startedAt,
    finishedAt: startedAt + 10 * 60_000,
    durationMs: 8 * 60_000,
    timedOut: false,
    score: 6,
    maxPoints: 60,
    correctCount: 1,
    answeredCount: 2,
    taskIds,
    answers: outcomes.map((outcome, index) =>
      outcome === "unanswered" ? [""] : [String(index)],
    ),
    results: outcomes.map((outcome, index) => ({
      taskId: taskIds[index],
      outcome,
      earnedPoints: outcome === "correct" ? 6 : 0,
      maxPoints: 6,
    })),
    progress: {
      contentRevision: `sha256:${"a".repeat(64)}`,
      items: taskIds.map((taskId, index) => ({
        taskId,
        taskRevision: `sha256:${String(index).repeat(64)}`,
        slot: index + 1,
        examPosition: index + 1,
        topic: `topic-${index + 1}`,
        maxPoints: 6,
      })),
    },
  };
}

describe("simulation progress projection", () => {
  it("builds a point-consistent GraphQL run from frozen history", () => {
    const entry = historyEntry();
    const run = buildCompletedSimulationRun(entry);

    expect(run).toMatchObject({
      id: runId,
      kind: "SIMULATION",
      blueprintVersion: "ftn-p1:2026.1",
      contentRevision: entry.progress?.contentRevision,
      activeDurationMs: 8 * 60_000,
    });
    expect(run?.items).toHaveLength(10);
    const firstItemId = progressRunItemId(runId, "task-1");
    expect(run?.items[0]).toMatchObject({
      id: firstItemId,
      maxPoints: 6,
      attempt: {
        id: progressAttemptId(firstItemId),
        answer: '["0"]',
        outcome: "CORRECT",
        earnedPoints: 6,
      },
    });
    expect(run?.items[1].attempt).toMatchObject({
      outcome: "INCORRECT",
      earnedPoints: 0,
    });
    expect(run?.items[2].attempt).toMatchObject({ outcome: "SKIPPED" });
    expect(run?.items[2].attempt).not.toHaveProperty("answer");
    expect(run?.items[2].attempt).not.toHaveProperty("earnedPoints");
    expect(JSON.stringify(run)).not.toMatch(/correctAnswer|expected|solution/i);
  });

  it("does not synthesize missing or inconsistent frozen metadata", () => {
    const legacy = historyEntry();
    delete legacy.progress;
    expect(buildCompletedSimulationRun(legacy)).toBeNull();

    const mismatched = historyEntry();
    if (mismatched.progress) mismatched.progress.items[0].maxPoints = 5;
    expect(buildCompletedSimulationRun(mismatched)).toBeNull();

    const corrupt = historyEntry();
    if (corrupt.progress) corrupt.progress.items[0].taskRevision = "mutable";
    expect(buildCompletedSimulationRun(corrupt)).toBeNull();
  });
});
