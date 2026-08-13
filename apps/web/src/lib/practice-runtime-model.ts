import {
  learningRunOwnerTransition,
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import type {
  PracticeCloudAttempt,
  PracticeCloudDraftInput,
  PracticeCloudRun,
} from "./practice-cloud-types";
import {
  emptyPracticeRuntimeState,
  parsePersistedPracticeRuntimeState,
} from "./practice-runtime-persistence";
import type {
  PersistedPracticeRun,
  PersistedPracticeRuntimeState,
  PracticeCheckpointFlight,
  PracticeRuntimeStart,
} from "./practice-runtime-types";

export type PendingPracticeAttempt = {
  itemIndex: number;
  taskId: string;
  attempt: PracticeCloudAttempt;
};

export function reconcilePracticeRuntimeOwner(
  state: PersistedPracticeRuntimeState,
  userId: string | null,
): { ownerId: LearningRunOwnerId; runtime: PersistedPracticeRuntimeState } {
  const parsedOwner = parseLearningRunOwner(userId);
  const ownerId = parsedOwner ?? null;
  if (parsedOwner === undefined) {
    return { ownerId, runtime: emptyPracticeRuntimeState() };
  }
  const parsed = parsePersistedPracticeRuntimeState(state);
  if (parsed.runs.length === 0) return { ownerId, runtime: parsed };
  const currentOwner = parsed.runs[0].runOwnerId;
  const transition = learningRunOwnerTransition(currentOwner, ownerId);
  if (transition === "clear") {
    return { ownerId, runtime: emptyPracticeRuntimeState() };
  }
  if (transition === "claim") {
    return {
      ownerId,
      runtime: {
        runs: parsed.runs.map((run) => ({ ...run, runOwnerId: ownerId })),
      },
    };
  }
  return { ownerId, runtime: parsed };
}

export function nextPendingAttempt(
  run: PersistedPracticeRun,
): PendingPracticeAttempt | null {
  return (
    run.items
      .flatMap((item, itemIndex) =>
        item.attempts
          .slice(run.syncedAttemptCounts[itemIndex])
          .map((attempt) => ({ itemIndex, taskId: item.taskId, attempt })),
      )
      .toSorted(
        (left, right) =>
          left.attempt.submittedAt - right.attempt.submittedAt ||
          left.attempt.startedAt - right.attempt.startedAt ||
          left.attempt.id.localeCompare(right.attempt.id),
      )[0] ?? null
  );
}

export function currentPracticeDrafts(
  run: PersistedPracticeRun,
): PracticeCloudDraftInput[] {
  return run.items.flatMap((item) =>
    item.draft === null
      ? []
      : [
          {
            taskId: item.taskId,
            nextAttempt: item.draft.nextAttempt,
            answers: [...item.draft.answers],
            helpLevel: item.draft.helpLevel,
          },
        ],
  );
}

export function createPracticeRun(
  assignment: PracticeRuntimeStart["assignment"],
  ownerId: LearningRunOwnerId,
  startedAt: number,
): PersistedPracticeRun {
  return {
    assignment: {
      ...assignment,
      tasks: assignment.tasks.map((task) => ({ ...task })),
    },
    runOwnerId: ownerId,
    startedAt,
    startedRemotely: false,
    checkpointVersion: 0,
    checkpointRevision: 0,
    syncedAttemptCounts: assignment.tasks.map(() => 0),
    currentIndex: 0,
    activeDurationMs: 0,
    items: assignment.tasks.map((task) => ({
      taskId: task.id,
      attempts: [],
      draft: null,
    })),
    checkpointDirty: false,
    checkpointFlight: null,
    phase: "active",
    submission: null,
    updatedAt: startedAt,
  };
}

export function practiceRunFromCloud(
  remote: PracticeCloudRun,
): PersistedPracticeRun {
  const updatedAt = remote.items
    .flatMap((item) => item.attempts)
    .reduce(
      (latest, attempt) => Math.max(latest, attempt.submittedAt),
      remote.checkpointUpdatedAt
        ? Math.max(remote.startedAt, Date.parse(remote.checkpointUpdatedAt))
        : remote.startedAt,
    );
  return {
    assignment: {
      runId: remote.runId,
      blueprintVersion: remote.blueprintVersion,
      contentRevision: remote.contentRevision,
      tasks: remote.items.map(({ task }) => ({ ...task })),
    },
    runOwnerId: remote.runOwnerId,
    startedAt: remote.startedAt,
    startedRemotely: true,
    checkpointVersion: remote.checkpointVersion,
    checkpointRevision: remote.checkpointVersion,
    syncedAttemptCounts: remote.items.map((item) => item.attempts.length),
    currentIndex: remote.currentIndex,
    activeDurationMs: remote.activeDurationMs ?? 0,
    items: remote.items.map((item) => ({
      taskId: item.task.id,
      attempts: item.attempts.map(cloneAttempt),
      draft:
        item.draft === null || item.draft.stale
          ? null
          : {
              nextAttempt: item.draft.nextAttempt,
              answers: [...item.draft.answers],
              helpLevel: item.draft.helpLevel,
            },
    })),
    checkpointDirty: false,
    checkpointFlight: null,
    phase: "active",
    submission: null,
    updatedAt,
  };
}

export function validFlight(
  run: PersistedPracticeRun,
  flight: PracticeCheckpointFlight,
): boolean {
  if (flight.purpose === "draft") {
    return (
      flight.attemptId === null &&
      sameDrafts(flight.drafts, currentPracticeDrafts(run))
    );
  }
  const pending = nextPendingAttempt(run);
  if (pending === null || flight.attemptId !== pending.attempt.id) return false;
  return sameDrafts(flight.drafts, [
    {
      taskId: pending.taskId,
      nextAttempt: pending.attempt.number,
      answers: pending.attempt.answers,
      helpLevel: pending.attempt.helpLevel,
    },
  ]);
}

export function cloneFlight(
  flight: PracticeCheckpointFlight,
): PracticeCheckpointFlight {
  return {
    ...flight,
    drafts: flight.drafts.map((draft) => ({
      ...draft,
      answers: [...draft.answers],
    })),
  };
}

export function hasAttempts(run: PersistedPracticeRun): boolean {
  return run.items.some((item) => item.attempts.length > 0);
}

export function latestRunSubmittedAt(run: PersistedPracticeRun): number {
  return run.items
    .flatMap((item) => item.attempts)
    .reduce(
      (latest, attempt) => Math.max(latest, attempt.submittedAt),
      run.startedAt,
    );
}

export function isTerminal(
  outcome: PracticeCloudAttempt["outcome"] | undefined,
): boolean {
  return outcome === "correct" || outcome === "skipped";
}

export function isOutcome(
  value: unknown,
): value is PracticeCloudAttempt["outcome"] {
  return value === "correct" || value === "incorrect" || value === "skipped";
}

export function isAnswers(value: readonly string[], count: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  );
}

export function isIndex(value: unknown, length: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < length
  );
}

export function isHelpLevel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

export function isDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Date.now()
  );
}

export function isOptionalAttemptDuration(
  value: unknown,
  elapsedMs: number,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= elapsedMs + 5 * 60_000)
  );
}

export function isClientTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Date.now() + 5 * 60_000
  );
}

function sameDrafts(
  left: readonly PracticeCloudDraftInput[],
  right: readonly PracticeCloudDraftInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((draft, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        draft.taskId === other.taskId &&
        draft.nextAttempt === other.nextAttempt &&
        draft.helpLevel === other.helpLevel &&
        arraysEqual(draft.answers, other.answers)
      );
    })
  );
}

function cloneAttempt(attempt: PracticeCloudAttempt): PracticeCloudAttempt {
  return { ...attempt, answers: [...attempt.answers] };
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
