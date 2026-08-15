import type { PracticeCloudAttemptInput } from "./practice-cloud-types";
import {
  currentPracticeDrafts,
  type PendingPracticeAttempt,
} from "./practice-runtime-model";
import type {
  PersistedPracticeRun,
  PracticeCheckpointFlight,
} from "./practice-runtime-types";

export function createPracticeAttemptFlight(
  run: PersistedPracticeRun,
  pending: PendingPracticeAttempt,
): PracticeCheckpointFlight {
  return {
    id: `checkpoint:attempt:${pending.attempt.id}`,
    purpose: "attempt",
    attemptId: pending.attempt.id,
    expectedVersion: run.checkpointVersion,
    appliedVersion: null,
    checkpointRevision: run.checkpointRevision,
    currentIndex: run.currentIndex,
    activeDurationMs: run.activeDurationMs,
    drafts: [
      {
        taskId: pending.taskId,
        nextAttempt: pending.attempt.number,
        answers: [...pending.attempt.answers],
        helpLevel: pending.attempt.helpLevel,
      },
    ],
  };
}

export function createPracticeDraftFlight(
  run: PersistedPracticeRun,
): PracticeCheckpointFlight {
  return {
    id: `checkpoint:draft:${run.checkpointVersion}:${run.checkpointRevision}`,
    purpose: "draft",
    attemptId: null,
    expectedVersion: run.checkpointVersion,
    appliedVersion: null,
    checkpointRevision: run.checkpointRevision,
    currentIndex: run.currentIndex,
    activeDurationMs: run.activeDurationMs,
    drafts: currentPracticeDrafts(run),
  };
}

export function practiceAttemptInput(
  pending: PendingPracticeAttempt,
): PracticeCloudAttemptInput {
  const attempt = pending.attempt;
  return {
    taskId: pending.taskId,
    attemptNumber: attempt.number,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    ...(attempt.activeDurationMs === null
      ? {}
      : { activeDurationMs: attempt.activeDurationMs }),
    answers: attempt.answers,
    outcome: attempt.outcome,
    helpLevel: attempt.helpLevel,
  };
}
