import { describe, expect, it } from "vitest";
import {
  parseCompletedProgressRun,
  progressAttemptId,
  progressRubricAttemptId,
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

function completedSimulationRun(): CompletedProgressRun {
  const startedAt = Date.UTC(2026, 7, 10, 10);
  return {
    id: runId,
    kind: "SIMULATION",
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: `sha256:${"a".repeat(64)}`,
    startedAt: new Date(startedAt).toISOString(),
    submittedAt: new Date(startedAt + 10 * 60_000).toISOString(),
    items: Array.from({ length: 10 }, (_, index) => {
      const taskId = `task-${index + 1}`;
      const itemId = progressRunItemId(runId, taskId);
      return {
        id: itemId,
        taskId,
        examPosition: index + 1,
        topic: `topic-${index + 1}`,
        maxPoints: 6,
        answerPartCount: 1,
        taskRevision: `sha256:${String(index).repeat(64)}`,
        attempt: {
          id: progressAttemptId(itemId),
          startedAt: new Date(startedAt).toISOString(),
          submittedAt: new Date(startedAt + 10 * 60_000).toISOString(),
          outcome: "SKIPPED" as const,
          helpLevel: 0,
          gradingKind: "AUTO" as const,
        },
      };
    }),
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
    expect(progressRubricAttemptId(itemId)).not.toBe(progressAttemptId(itemId));
  });

  it("accepts a bounded self-assessed partial attempt on its own ID", () => {
    const run = completedRun();
    const item = run.items[0];
    item.maxPoints = 6;
    item.attempt = {
      ...item.attempt,
      id: progressRubricAttemptId(item.id),
      outcome: "PARTIAL",
      gradingKind: "RUBRIC_SELF",
      earnedPoints: 4,
    };

    expect(parseCompletedProgressRun(run)).toEqual(run);
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

  it("upgrades a complete legacy simulation with its canonical deadline", () => {
    const run = completedSimulationRun();

    expect(parseCompletedProgressRun(run)).toEqual({
      ...run,
      deadlineAt: "2026-08-10T14:00:00.000Z",
    });
  });

  it("keeps legacy items without answer shape and rejects invalid snapshots", () => {
    const legacy = completedSimulationRun();
    for (const item of legacy.items) delete item.answerPartCount;
    expect(parseCompletedProgressRun(legacy)).toMatchObject({ id: runId });

    const invalid = completedSimulationRun();
    invalid.items[0].answerPartCount = 7;
    expect(parseCompletedProgressRun(invalid)).toBeNull();

    const mismatched = completedSimulationRun();
    mismatched.items[0].answerPartCount = 2;
    mismatched.items[0].attempt = {
      ...mismatched.items[0].attempt,
      outcome: "INCORRECT",
      answer: '["42"]',
      earnedPoints: 0,
    };
    expect(parseCompletedProgressRun(mismatched)).toBeNull();

    const partial = completedSimulationRun();
    delete partial.items[0].answerPartCount;
    expect(parseCompletedProgressRun(partial)).toBeNull();

    const layeredLegacy = completedSimulationRun();
    for (const item of layeredLegacy.items) delete item.answerPartCount;
    layeredLegacy.items[0].previousAttempt = {
      ...layeredLegacy.items[0].attempt,
      id: progressAttemptId(layeredLegacy.items[0].id),
    };
    layeredLegacy.items[0].attempt = {
      ...layeredLegacy.items[0].attempt,
      id: progressRubricAttemptId(layeredLegacy.items[0].id),
      outcome: "PARTIAL",
      gradingKind: "RUBRIC_SELF",
      earnedPoints: 3,
      answer: '["42"]',
    };
    expect(parseCompletedProgressRun(layeredLegacy)).toBeNull();
  });

  it.each([
    [
      "an unqualified blueprint",
      (run: CompletedProgressRun) => {
        run.blueprintVersion = "2026.1";
      },
    ],
    [
      "an incomplete task set",
      (run: CompletedProgressRun) => {
        run.items.pop();
      },
    ],
    [
      "a mutable content revision",
      (run: CompletedProgressRun) => {
        run.contentRevision = "mutable";
      },
    ],
    [
      "a mutable task revision",
      (run: CompletedProgressRun) => {
        run.items[0].taskRevision = "mutable";
      },
    ],
    [
      "a duplicate position",
      (run: CompletedProgressRun) => {
        run.items[1].examPosition = run.items[0].examPosition;
      },
    ],
    [
      "permuted positions",
      (run: CompletedProgressRun) => {
        [run.items[0].examPosition, run.items[1].examPosition] = [
          run.items[1].examPosition,
          run.items[0].examPosition,
        ];
      },
    ],
    [
      "a 59-point ceiling",
      (run: CompletedProgressRun) => {
        run.items[0].maxPoints = 5;
      },
    ],
    [
      "a conflicting deadline",
      (run: CompletedProgressRun) => {
        run.deadlineAt = "2026-08-10T13:59:59.000Z";
      },
    ],
    [
      "an oversized active duration",
      (run: CompletedProgressRun) => {
        run.activeDurationMs = 4 * 60 * 60 * 1_000 + 1;
        run.submittedAt = "2026-08-10T15:00:00.000Z";
      },
    ],
    [
      "an attempt with an oversized active duration",
      (run: CompletedProgressRun) => {
        run.submittedAt = "2026-08-10T15:00:00.000Z";
        run.items[0].attempt.submittedAt = run.submittedAt;
        run.items[0].attempt.activeDurationMs = 4 * 60 * 60 * 1_000 + 1;
      },
    ],
  ])("rejects a simulation with %s", (_name, mutate) => {
    const run = completedSimulationRun();
    mutate(run);

    expect(parseCompletedProgressRun(run)).toBeNull();
  });
});
