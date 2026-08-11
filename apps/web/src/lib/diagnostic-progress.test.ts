import { describe, expect, it } from "vitest";
import type { PersistedDiagnosticState } from "./diagnostic-store";
import {
  buildCompletedDiagnosticRun,
  type DiagnosticProgressTask,
} from "./diagnostic-progress";
import { progressAttemptId, progressRunItemId } from "./progress-run";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.UTC(2026, 7, 10, 10);

function completedState(): PersistedDiagnosticState {
  return {
    runId,
    runOwnerId: null,
    checkpointVersion: 0,
    taskIds: Array.from({ length: 10 }, (_, index) => `task-${index + 1}`),
    slots: Array.from({ length: 10 }, (_, index) => index + 1),
    answers: Array.from({ length: 10 }, (_, index) => [String(index + 1)]),
    outcomes: [
      "correct",
      "incorrect",
      "skipped",
      "correct",
      "correct",
      "incorrect",
      "correct",
      "correct",
      "incorrect",
      "correct",
    ],
    completedAt: Array.from(
      { length: 10 },
      (_, index) => startedAt + (index + 1) * 60_000,
    ),
    phase: "done",
    currentIndex: 9,
    startedAt,
  };
}

function tasks(): DiagnosticProgressTask[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `task-${index + 1}`,
    revision: `sha256:${String(index).repeat(64)}`,
    slot: index + 1,
    examPosition: index + 1,
    topic: `topic-${index + 1}`,
  }));
}

describe("diagnostic progress projection", () => {
  it("builds a stable 10-attempt GraphQL run without trusted answers", () => {
    const state = completedState();
    const contentRevision = `sha256:${"a".repeat(64)}`;

    const run = buildCompletedDiagnosticRun(
      state,
      tasks(),
      "ftn-p1:2026.1",
      contentRevision,
    );

    expect(run).toMatchObject({
      id: runId,
      kind: "DIAGNOSTIC",
      blueprintVersion: "ftn-p1:2026.1",
      contentRevision,
      startedAt: new Date(startedAt).toISOString(),
      submittedAt: new Date(startedAt + 10 * 60_000).toISOString(),
    });
    expect(run?.items).toHaveLength(10);
    const firstItemId = progressRunItemId(runId, "task-1");
    expect(run?.items[0]).toMatchObject({
      id: firstItemId,
      attempt: {
        id: progressAttemptId(firstItemId),
        answer: '["1"]',
        outcome: "CORRECT",
      },
    });
    expect(run?.items[1].attempt).toMatchObject({
      startedAt: new Date(startedAt + 60_000).toISOString(),
      outcome: "INCORRECT",
    });
    expect(run?.items[2].attempt).not.toHaveProperty("answer");
    expect(run?.items[2].attempt.outcome).toBe("SKIPPED");
    expect(JSON.stringify(run)).not.toMatch(/expected|solution/i);
  });

  it("rejects incomplete state or content that does not match the run", () => {
    const running = completedState();
    running.phase = "running";
    expect(
      buildCompletedDiagnosticRun(running, tasks(), "ftn-p1:2026.1", "rev"),
    ).toBeNull();

    const mismatched = tasks();
    mismatched[0].id = "different-task";
    expect(
      buildCompletedDiagnosticRun(
        completedState(),
        mismatched,
        "ftn-p1:2026.1",
        "rev",
      ),
    ).toBeNull();

    const missingTimes = completedState();
    missingTimes.completedAt = [];
    expect(
      buildCompletedDiagnosticRun(
        missingTimes,
        tasks(),
        "ftn-p1:2026.1",
        "rev",
      ),
    ).toBeNull();
  });
});
