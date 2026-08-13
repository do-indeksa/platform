"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  learningRunOwnerTransition,
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAttempt,
  type PracticeCloudDraftInput,
  type PracticeCloudRun,
} from "./practice-cloud-types";
import {
  emptyPracticeRuntimeState,
  migratePracticeRuntimeState,
  parsePersistedPracticeRuntimeState,
} from "./practice-runtime-persistence";
import {
  MAX_LOCAL_PRACTICE_RUNS,
  type PersistedPracticeRun,
  type PersistedPracticeRuntimeState,
  type PracticeCheckpointFlight,
  type PracticeRuntimeAttemptInput,
  type PracticeRuntimeDraftChange,
  type PracticeRuntimeStart,
} from "./practice-runtime-types";

export const PRACTICE_RUNTIME_STORE_VERSION = 1;

export type PendingPracticeAttempt = {
  itemIndex: number;
  taskId: string;
  attempt: PracticeCloudAttempt;
};

type PracticeRuntimeState = PersistedPracticeRuntimeState & {
  authOwnerId: string | null | undefined;
  syncOwner: (userId: string | null) => void;
  start: (input: PracticeRuntimeStart) => boolean;
  restore: (remote: PracticeCloudRun) => boolean;
  changeDraft: (runId: string, input: PracticeRuntimeDraftChange) => boolean;
  appendAttempt: (
    runId: string,
    input: PracticeRuntimeAttemptInput,
  ) => string | null;
  beginSubmission: (
    runId: string,
    submittedAt: number,
    activeDurationMs: number,
  ) => boolean;
  markStartedRemotely: (runId: string) => boolean;
  beginCheckpointFlight: (
    runId: string,
    flight: PracticeCheckpointFlight,
  ) => boolean;
  markCheckpointApplied: (
    runId: string,
    flightId: string,
    version: number,
  ) => boolean;
  finishCheckpointFlight: (runId: string, flightId: string) => boolean;
  markAttemptSynced: (runId: string, attemptId: string) => boolean;
  finishSubmission: (runId: string) => boolean;
  remove: (runId: string) => void;
  reset: () => void;
};

export const usePracticeRuntime = create<PracticeRuntimeState>()(
  persist(
    (set, get) => ({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
      syncOwner: (userId) => {
        const reconciled = reconcilePracticeRuntimeOwner(get(), userId);
        set({ ...reconciled.runtime, authOwnerId: reconciled.ownerId });
      },
      start: ({ assignment, startedAt = Date.now() }) => {
        const state = get();
        if (
          state.authOwnerId === undefined ||
          state.runs.some((run) => run.assignment.runId === assignment.runId)
        ) {
          return false;
        }
        const parsed = parsePersistedPracticeRuntimeState({
          runs: [
            ...state.runs,
            createPracticeRun(assignment, state.authOwnerId, startedAt),
          ],
        });
        if (parsed.runs.length !== state.runs.length + 1) return false;
        set({
          runs: parsed.runs
            .toSorted((left, right) => right.updatedAt - left.updatedAt)
            .slice(0, MAX_LOCAL_PRACTICE_RUNS),
        });
        return true;
      },
      restore: (remote) => {
        const state = get();
        if (
          state.authOwnerId === undefined ||
          remote.runOwnerId !== state.authOwnerId
        ) {
          return false;
        }
        const restored = practiceRunFromCloud(remote);
        const parsed = parsePersistedPracticeRuntimeState({
          runs: [
            restored,
            ...state.runs.filter(
              (run) => run.assignment.runId !== remote.runId,
            ),
          ],
        });
        if (parsed.runs.length === 0) return false;
        set({ runs: parsed.runs });
        return true;
      },
      changeDraft: (runId, input) =>
        updateRun(set, get, runId, (run) => {
          if (run.phase !== "active") return null;
          const itemIndex = run.items.findIndex(
            (item) => item.taskId === input.taskId,
          );
          const task = run.assignment.tasks[itemIndex];
          const item = run.items[itemIndex];
          const latest = item?.attempts.at(-1);
          if (
            task === undefined ||
            item === undefined ||
            item.attempts.length >= MAX_PRACTICE_ATTEMPTS_PER_TASK ||
            isTerminal(latest?.outcome) ||
            !isIndex(input.currentIndex, run.items.length) ||
            !isDuration(input.activeDurationMs) ||
            input.activeDurationMs < run.activeDurationMs ||
            !isAnswers(input.answers, task.answerPartCount) ||
            !isHelpLevel(input.helpLevel) ||
            input.helpLevel < (latest?.helpLevel ?? 0)
          ) {
            return null;
          }
          return {
            ...run,
            currentIndex: input.currentIndex,
            activeDurationMs: input.activeDurationMs,
            items: run.items.with(itemIndex, {
              ...item,
              draft: {
                nextAttempt: item.attempts.length + 1,
                answers: [...input.answers],
                helpLevel: input.helpLevel,
              },
            }),
            checkpointDirty: true,
            checkpointRevision: run.checkpointRevision + 1,
            updatedAt: Date.now(),
          };
        }),
      appendAttempt: (runId, input) => {
        let attemptId: string | null = null;
        updateRun(set, get, runId, (run) => {
          if (run.phase !== "active") return null;
          const itemIndex = run.items.findIndex(
            (item) => item.taskId === input.taskId,
          );
          const task = run.assignment.tasks[itemIndex];
          const item = run.items[itemIndex];
          const latest = item?.attempts.at(-1);
          const attemptNumber = (item?.attempts.length ?? 0) + 1;
          const lastSubmittedAt = latestRunSubmittedAt(run);
          if (
            task === undefined ||
            item === undefined ||
            attemptNumber > MAX_PRACTICE_ATTEMPTS_PER_TASK ||
            isTerminal(latest?.outcome) ||
            !isIndex(input.currentIndex, run.items.length) ||
            !isDuration(input.runActiveDurationMs) ||
            input.runActiveDurationMs < run.activeDurationMs ||
            !isClientTime(input.startedAt) ||
            !isClientTime(input.submittedAt) ||
            input.startedAt < lastSubmittedAt ||
            input.submittedAt < input.startedAt ||
            !isOptionalAttemptDuration(
              input.activeDurationMs,
              input.submittedAt - input.startedAt,
            ) ||
            !isAnswers(input.answers, task.answerPartCount) ||
            !isOutcome(input.outcome) ||
            !isHelpLevel(input.helpLevel) ||
            input.helpLevel < (latest?.helpLevel ?? 0)
          ) {
            return null;
          }
          const runItemId = progressRunItemId(runId, task.id);
          attemptId = progressPracticeAttemptId(runItemId, attemptNumber);
          const attempt: PracticeCloudAttempt = {
            id: attemptId,
            number: attemptNumber,
            startedAt: input.startedAt,
            submittedAt: input.submittedAt,
            activeDurationMs: input.activeDurationMs ?? null,
            answers: [...input.answers],
            outcome: input.outcome,
            helpLevel: input.helpLevel,
          };
          return {
            ...run,
            currentIndex: input.currentIndex,
            activeDurationMs: input.runActiveDurationMs,
            items: run.items.with(itemIndex, {
              ...item,
              attempts: [...item.attempts, attempt],
              draft:
                isTerminal(input.outcome) ||
                attemptNumber === MAX_PRACTICE_ATTEMPTS_PER_TASK
                  ? null
                  : {
                      nextAttempt: attemptNumber + 1,
                      answers: [...input.answers],
                      helpLevel: input.helpLevel,
                    },
            }),
            checkpointDirty: true,
            checkpointRevision: run.checkpointRevision + 1,
            updatedAt: Date.now(),
          };
        });
        return attemptId;
      },
      beginSubmission: (runId, submittedAt, activeDurationMs) =>
        updateRun(set, get, runId, (run) => {
          if (
            run.phase !== "active" ||
            !hasAttempts(run) ||
            !isClientTime(submittedAt) ||
            submittedAt < latestRunSubmittedAt(run) ||
            !isDuration(activeDurationMs) ||
            activeDurationMs < run.activeDurationMs
          ) {
            return null;
          }
          return {
            ...run,
            phase: "submitting",
            activeDurationMs,
            submission: { submittedAt, activeDurationMs },
            updatedAt: Date.now(),
          };
        }),
      markStartedRemotely: (runId) =>
        updateRun(set, get, runId, (run) =>
          run.startedRemotely
            ? run
            : { ...run, startedRemotely: true, updatedAt: Date.now() },
        ),
      beginCheckpointFlight: (runId, flight) =>
        updateRun(set, get, runId, (run) => {
          if (
            !run.startedRemotely ||
            run.checkpointFlight !== null ||
            flight.expectedVersion !== run.checkpointVersion ||
            flight.appliedVersion !== null ||
            flight.checkpointRevision !== run.checkpointRevision ||
            flight.currentIndex !== run.currentIndex ||
            flight.activeDurationMs !== run.activeDurationMs ||
            (flight.purpose === "draft" && !run.checkpointDirty) ||
            !validFlight(run, flight)
          ) {
            return null;
          }
          return { ...run, checkpointFlight: cloneFlight(flight) };
        }),
      markCheckpointApplied: (runId, flightId, version) =>
        updateRun(set, get, runId, (run) => {
          const flight = run.checkpointFlight;
          if (
            flight === null ||
            flight.id !== flightId ||
            flight.appliedVersion !== null ||
            version !== flight.expectedVersion + 1
          ) {
            return null;
          }
          return {
            ...run,
            checkpointVersion: version,
            checkpointFlight: { ...flight, appliedVersion: version },
          };
        }),
      finishCheckpointFlight: (runId, flightId) =>
        updateRun(set, get, runId, (run) => {
          const flight = run.checkpointFlight;
          if (
            flight === null ||
            flight.id !== flightId ||
            flight.appliedVersion !== run.checkpointVersion ||
            flight.purpose !== "draft"
          ) {
            return null;
          }
          return {
            ...run,
            checkpointFlight: null,
            checkpointDirty:
              run.checkpointRevision !== flight.checkpointRevision,
            updatedAt: Date.now(),
          };
        }),
      markAttemptSynced: (runId, attemptId) =>
        updateRun(set, get, runId, (run) => {
          const flight = run.checkpointFlight;
          const next = nextPendingAttempt(run);
          if (
            flight === null ||
            flight.purpose !== "attempt" ||
            flight.attemptId !== attemptId ||
            flight.appliedVersion !== run.checkpointVersion ||
            next?.attempt.id !== attemptId
          ) {
            return null;
          }
          return {
            ...run,
            syncedAttemptCounts: run.syncedAttemptCounts.with(
              next.itemIndex,
              run.syncedAttemptCounts[next.itemIndex] + 1,
            ),
            checkpointFlight: null,
            checkpointDirty:
              run.checkpointRevision !== flight.checkpointRevision ||
              run.items.some((item) => item.draft !== null),
            updatedAt: Date.now(),
          };
        }),
      finishSubmission: (runId) => {
        const target = get().runs.find((run) => run.assignment.runId === runId);
        if (target?.phase !== "submitting") return false;
        set({
          runs: get().runs.filter((run) => run.assignment.runId !== runId),
        });
        return true;
      },
      remove: (runId) =>
        set({
          runs: get().runs.filter((run) => run.assignment.runId !== runId),
        }),
      reset: () => set(emptyPracticeRuntimeState()),
    }),
    {
      name: "do-indeksa-practice-runtime",
      version: PRACTICE_RUNTIME_STORE_VERSION,
      partialize: (state): PersistedPracticeRuntimeState => ({
        runs: state.runs,
      }),
      migrate: migratePracticeRuntimeState,
      merge: (persisted, current) => ({
        ...current,
        ...parsePersistedPracticeRuntimeState(persisted),
      }),
    },
  ),
);

export function syncPracticeRuntimeOwner(userId: string | null): void {
  usePracticeRuntime.getState().syncOwner(userId);
}

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

function createPracticeRun(
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

function practiceRunFromCloud(remote: PracticeCloudRun): PersistedPracticeRun {
  const updatedAt = remote.checkpointUpdatedAt
    ? Date.parse(remote.checkpointUpdatedAt)
    : remote.items
        .flatMap((item) => item.attempts)
        .reduce(
          (latest, attempt) => Math.max(latest, attempt.submittedAt),
          remote.startedAt,
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

function updateRun(
  set: (state: Partial<PracticeRuntimeState>) => void,
  get: () => PracticeRuntimeState,
  runId: string,
  update: (run: PersistedPracticeRun) => PersistedPracticeRun | null,
): boolean {
  const state = get();
  const index = state.runs.findIndex((run) => run.assignment.runId === runId);
  if (index < 0) return false;
  const next = update(state.runs[index]);
  if (next === null) return false;
  const parsed = parsePersistedPracticeRuntimeState({
    runs: state.runs.with(index, next),
  });
  if (parsed.runs.length !== state.runs.length) return false;
  set({ runs: parsed.runs });
  return true;
}

function validFlight(
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

function cloneFlight(flight: PracticeCheckpointFlight) {
  return {
    ...flight,
    drafts: flight.drafts.map((draft) => ({
      ...draft,
      answers: [...draft.answers],
    })),
  };
}

function cloneAttempt(attempt: PracticeCloudAttempt): PracticeCloudAttempt {
  return { ...attempt, answers: [...attempt.answers] };
}

function hasAttempts(run: PersistedPracticeRun): boolean {
  return run.items.some((item) => item.attempts.length > 0);
}

function latestRunSubmittedAt(run: PersistedPracticeRun): number {
  return run.items
    .flatMap((item) => item.attempts)
    .reduce(
      (latest, attempt) => Math.max(latest, attempt.submittedAt),
      run.startedAt,
    );
}

function isTerminal(outcome: PracticeCloudAttempt["outcome"] | undefined) {
  return outcome === "correct" || outcome === "skipped";
}

function isOutcome(value: unknown): value is PracticeCloudAttempt["outcome"] {
  return value === "correct" || value === "incorrect" || value === "skipped";
}

function isAnswers(value: readonly string[], count: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  );
}

function isIndex(value: unknown, length: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < length
  );
}

function isHelpLevel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

function isDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Date.now()
  );
}

function isOptionalAttemptDuration(
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

function isClientTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Date.now() + 5 * 60_000
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export type {
  PersistedPracticeRun,
  PersistedPracticeRuntimeState,
  PracticeCheckpointFlight,
  PracticeRuntimeAttemptInput,
  PracticeRuntimeDraftChange,
  PracticeRuntimeStart,
} from "./practice-runtime-types";
