import { describe, expect, it } from "vitest";
import {
  parseCompletedProgressRun,
  progressAttemptId,
  progressRunItemId,
  type CompletedProgressRun,
} from "./progress-run";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";

function completedRun(): CompletedProgressRun {
  const firstItemId = progressRunItemId(runId, "kb-001");
  const secondItemId = progressRunItemId(runId, "kv-001");
  return {
    id: runId,
    kind: "DIAGNOSTIC",
    blueprintVersion: "diagnostic-v1",
    contentRevision: `sha256:${"a".repeat(64)}`,
    startedAt: "2026-08-10T10:00:00.000Z",
    submittedAt: "2026-08-10T10:05:00.000Z",
    activeDurationMs: 240_000,
    items: [
      {
        id: firstItemId,
        taskId: "kb-001",
        examPosition: 1,
        topic: "kompleksni-brojevi",
        taskRevision: `sha256:${"b".repeat(64)}`,
        attempt: {
          id: progressAttemptId(firstItemId),
          startedAt: "2026-08-10T10:00:00.000Z",
          submittedAt: "2026-08-10T10:02:00.000Z",
          activeDurationMs: 90_000,
          answer: '["1","2"]',
          outcome: "CORRECT",
          helpLevel: 0,
          gradingKind: "AUTO",
        },
      },
      {
        id: secondItemId,
        taskId: "kv-001",
        examPosition: 2,
        topic: "kvadratne-jednacine",
        taskRevision: `sha256:${"c".repeat(64)}`,
        attempt: {
          id: progressAttemptId(secondItemId),
          startedAt: "2026-08-10T10:02:00.000Z",
          submittedAt: "2026-08-10T10:05:00.000Z",
          outcome: "SKIPPED",
          helpLevel: 0,
          gradingKind: "AUTO",
        },
      },
    ],
  };
}

describe("completed progress runs", () => {
  it("accepts a bounded completed diagnostic snapshot", () => {
    const run = completedRun();

    expect(parseCompletedProgressRun(structuredClone(run))).toEqual(run);
  });

  it("derives stable IDs from the run, task, and first attempt", () => {
    const itemId = progressRunItemId(runId, "kb-001");

    expect(progressRunItemId(runId, "kb-001")).toBe(itemId);
    expect(progressRunItemId(runId, "kv-001")).not.toBe(itemId);
    expect(progressAttemptId(itemId)).toBe(progressAttemptId(itemId));
  });

  it.each([
    [
      "arbitrary item ID",
      (run: CompletedProgressRun) => {
        run.items[0].id = crypto.randomUUID();
      },
    ],
    [
      "arbitrary attempt ID",
      (run: CompletedProgressRun) => {
        run.items[0].attempt.id = crypto.randomUUID();
      },
    ],
    [
      "duplicate task",
      (run: CompletedProgressRun) => {
        run.items[1].taskId = run.items[0].taskId;
        run.items[1].id = run.items[0].id;
        run.items[1].attempt.id = run.items[0].attempt.id;
      },
    ],
    [
      "non-ISO timestamp",
      (run: CompletedProgressRun) => {
        run.submittedAt = "2026-08-10 10:05:00";
      },
    ],
    [
      "attempt after run submission",
      (run: CompletedProgressRun) => {
        run.items[1].attempt.submittedAt = "2026-08-10T10:06:00.000Z";
      },
    ],
    [
      "oversized answer",
      (run: CompletedProgressRun) => {
        run.items[0].attempt.answer = "x".repeat(8_193);
      },
    ],
    [
      "partial result without points",
      (run: CompletedProgressRun) => {
        run.items[0].attempt.outcome = "PARTIAL";
        run.items[0].maxPoints = 6;
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const run = completedRun();
    mutate(run);

    expect(parseCompletedProgressRun(run)).toBeNull();
  });

  it("enforces simulation position and point invariants", () => {
    const run = completedRun();
    run.kind = "SIMULATION";
    run.items[0].maxPoints = 30;
    run.items[0].attempt.earnedPoints = 30;
    run.items[1].maxPoints = 31;

    expect(parseCompletedProgressRun(run)).toBeNull();

    run.items[1].maxPoints = 30;
    run.items[1].examPosition = run.items[0].examPosition;
    expect(parseCompletedProgressRun(run)).toBeNull();

    run.items[1].examPosition = 2;
    expect(parseCompletedProgressRun(run)).toEqual(run);
  });
});
