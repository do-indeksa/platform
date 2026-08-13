import { describe, expect, it } from "vitest";
import type { JournalAttempt } from "./attempt-journal";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import {
  practiceRuntimeAttempts,
  samePracticeAction,
  uniqueAttemptIds,
} from "./practice-attempt-view";
import type { PersistedPracticeRun } from "./practice-runtime-types";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "a0209703-275b-4c6e-b815-25025b923ae8";
const startedAt = Date.parse("2026-07-12T09:59:50.000Z");
const submittedAt = Date.parse("2026-07-12T10:00:00.000Z");
const taskRevision = `sha256:${"a".repeat(64)}`;
const runItemId = progressRunItemId(runId, "kb-001");
const attemptId = progressPracticeAttemptId(runItemId, 1);

describe("practice attempt view", () => {
  it("projects the deterministic runtime attempt as rich progress", () => {
    expect(practiceRuntimeAttempts([runtimeRun()])).toEqual([
      {
        id: attemptId,
        attempt: {
          taskId: "kb-001",
          slot: 1,
          correct: true,
          source: "practice",
          helpLevel: 1,
          at: "2026-07-12T10:00:00.000Z",
        },
        journal: {
          id: attemptId,
          runItemId,
          taskId: "kb-001",
          examPosition: 1,
          mode: "practice",
          startedAt: "2026-07-12T09:59:50.000Z",
          submittedAt: "2026-07-12T10:00:00.000Z",
          activeDurationMs: 10_000,
          answer: '["2","3"]',
          outcome: "CORRECT",
          helpLevel: 1,
          gradingKind: "AUTO",
          taskRevision,
        },
      },
    ]);
  });

  it("matches only the exact duplicate and retains a later retry", () => {
    const [canonical] = practiceRuntimeAttempts([runtimeRun()]);
    const duplicate = { ...canonical.journal, runItemId: undefined };
    const retry = {
      ...duplicate,
      id: "cb973bed-6f86-410b-89fa-26bedc57cf1e",
      startedAt: duplicate.submittedAt,
      submittedAt: "2026-07-12T10:01:00.000Z",
    } satisfies JournalAttempt;

    expect(samePracticeAction(canonical.journal, duplicate)).toBe(true);
    expect(samePracticeAction(canonical.journal, retry)).toBe(false);
  });

  it("keeps the first occurrence of each stable attempt ID", () => {
    expect(
      uniqueAttemptIds([
        { id: attemptId, source: "server" },
        { id: attemptId, source: "runtime" },
        { id: null, source: "legacy-a" },
        { id: null, source: "legacy-b" },
      ]),
    ).toEqual([
      { id: attemptId, source: "server" },
      { id: null, source: "legacy-a" },
      { id: null, source: "legacy-b" },
    ]);
  });
});

function runtimeRun(): PersistedPracticeRun {
  return {
    assignment: {
      runId,
      blueprintVersion: "ftn-p1:2026.1",
      contentRevision: `sha256:${"b".repeat(64)}`,
      tasks: [
        {
          id: "kb-001",
          revision: taskRevision,
          slot: 1,
          topic: "kompleksni-brojevi",
          answerPartCount: 2,
        },
      ],
    },
    runOwnerId: ownerId,
    startedAt,
    startedRemotely: false,
    checkpointVersion: 0,
    checkpointRevision: 1,
    syncedAttemptCounts: [0],
    currentIndex: 0,
    activeDurationMs: 10_000,
    items: [
      {
        taskId: "kb-001",
        attempts: [
          {
            id: attemptId,
            number: 1,
            startedAt,
            submittedAt,
            activeDurationMs: 10_000,
            answers: ["2", "3"],
            outcome: "correct",
            helpLevel: 1,
          },
        ],
        draft: null,
      },
    ],
    checkpointDirty: true,
    checkpointFlight: null,
    phase: "active",
    submission: null,
    updatedAt: submittedAt,
  };
}
