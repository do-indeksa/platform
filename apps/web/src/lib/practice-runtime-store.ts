"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAttempt,
  type PracticeCloudRun,
} from "./practice-cloud-types";
import {
  emptyPracticeRuntimeState,
  migratePracticeRuntimeState,
  parsePersistedPracticeRuntimeState,
} from "./practice-runtime-persistence";
import {
  cloneFlight,
  createPracticeRun,
  hasAttempts,
  isAnswers,
  isClientTime,
  isDuration,
  isHelpLevel,
  isIndex,
  isOptionalAttemptDuration,
  isOutcome,
  isTerminal,
  latestRunSubmittedAt,
  nextPendingAttempt,
  practiceRunFromCloud,
  reconcilePracticeRuntimeOwner,
  validFlight,
} from "./practice-runtime-model";
import {
  MAX_LOCAL_PRACTICE_RUNS,
  type PersistedPracticeRun,
  type PersistedPracticeRuntimeState,
  type PracticeCheckpointFlight,
  type PracticeRuntimeAttemptInput,
  type PracticeRuntimeDraftChange,
  type PracticeRuntimeStart,
  type PracticeRuntimeVisit,
} from "./practice-runtime-types";

export const PRACTICE_RUNTIME_STORE_VERSION = 1;

type PracticeRuntimeState = PersistedPracticeRuntimeState & {
  authOwnerId: string | null | undefined;
  authOwnerGeneration: number;
  syncOwner: (userId: string | null) => void;
  start: (input: PracticeRuntimeStart) => boolean;
  restore: (remote: PracticeCloudRun) => boolean;
  visit: (runId: string, input: PracticeRuntimeVisit) => boolean;
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
      authOwnerGeneration: 0,
      syncOwner: (userId) => {
        const state = get();
        const reconciled = reconcilePracticeRuntimeOwner(state, userId);
        set({
          ...reconciled.runtime,
          authOwnerId: reconciled.ownerId,
          authOwnerGeneration:
            state.authOwnerId === reconciled.ownerId
              ? state.authOwnerGeneration
              : state.authOwnerGeneration + 1,
        });
      },
      start: ({ assignment, startedAt = Date.now() }) => {
        const state = get();
        if (
          state.authOwnerId === undefined ||
          state.runs.length >= MAX_LOCAL_PRACTICE_RUNS ||
          state.runs.some((run) => run.assignment.runId === assignment.runId)
        ) {
          return false;
        }
        const runs = [
          ...state.runs,
          createPracticeRun(assignment, state.authOwnerId, startedAt),
        ].toSorted((left, right) => right.updatedAt - left.updatedAt);
        const parsed = parsePersistedPracticeRuntimeState({ runs });
        if (parsed.runs.length !== runs.length) return false;
        set({ runs: parsed.runs });
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
      visit: (runId, input) => {
        const current = get().runs.find(
          (run) => run.assignment.runId === runId,
        );
        if (
          current?.phase !== "active" ||
          !isIndex(input.currentIndex, current.items.length) ||
          !isDuration(input.activeDurationMs) ||
          input.activeDurationMs < current.activeDurationMs
        ) {
          return false;
        }
        if (
          input.currentIndex === current.currentIndex &&
          input.activeDurationMs === current.activeDurationMs
        ) {
          return true;
        }
        return updateRun(set, get, runId, (run) => ({
          ...run,
          currentIndex: input.currentIndex,
          activeDurationMs: input.activeDurationMs,
          checkpointDirty: true,
          checkpointRevision: run.checkpointRevision + 1,
          updatedAt: nextRunUpdateTime(run),
        }));
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
            input.helpLevel <
              Math.max(latest?.helpLevel ?? 0, item.draft?.helpLevel ?? 0)
          ) {
            return null;
          }
          if (
            run.currentIndex === input.currentIndex &&
            run.activeDurationMs === input.activeDurationMs &&
            item.draft !== null &&
            item.draft.helpLevel === input.helpLevel &&
            sameAnswers(item.draft.answers, input.answers)
          ) {
            return run;
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
            updatedAt: nextRunUpdateTime(run),
          };
        }),
      appendAttempt: (runId, input) => {
        let attemptId: string | null = null;
        const updated = updateRun(set, get, runId, (run) => {
          if (run.phase !== "active") return null;
          const itemIndex = run.items.findIndex(
            (item) => item.taskId === input.taskId,
          );
          const task = run.assignment.tasks[itemIndex];
          const item = run.items[itemIndex];
          const latest = item?.attempts.at(-1);
          const attemptNumber = (item?.attempts.length ?? 0) + 1;
          const lastSubmittedAt = latestRunSubmittedAt(run);
          const hasPreviousAttempt = hasAttempts(run);
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
            (hasPreviousAttempt && input.submittedAt <= lastSubmittedAt) ||
            !isOptionalAttemptDuration(
              input.activeDurationMs,
              input.submittedAt - input.startedAt,
            ) ||
            !isAnswers(input.answers, task.answerPartCount) ||
            !isOutcome(input.outcome) ||
            !isHelpLevel(input.helpLevel) ||
            input.helpLevel <
              Math.max(latest?.helpLevel ?? 0, item.draft?.helpLevel ?? 0)
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
            updatedAt: nextRunUpdateTime(run),
          };
        });
        return updated ? attemptId : null;
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
            updatedAt: nextRunUpdateTime(run),
          };
        }),
      markStartedRemotely: (runId) =>
        updateRun(set, get, runId, (run) =>
          run.startedRemotely
            ? run
            : {
                ...run,
                startedRemotely: true,
                updatedAt: nextRunUpdateTime(run),
              },
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
            updatedAt: nextRunUpdateTime(run),
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
            updatedAt: nextRunUpdateTime(run),
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
  if (next === state.runs[index]) return true;
  const parsed = parsePersistedPracticeRuntimeState({
    runs: state.runs.with(index, next),
  });
  if (parsed.runs.length !== state.runs.length) return false;
  set({ runs: parsed.runs });
  return true;
}

function nextRunUpdateTime(run: PersistedPracticeRun): number {
  return Math.max(Date.now(), run.startedAt, run.updatedAt);
}

function sameAnswers(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((answer, index) => answer === right[index])
  );
}

export {
  currentPracticeDrafts,
  nextPendingAttempt,
  reconcilePracticeRuntimeOwner,
} from "./practice-runtime-model";
export type { PendingPracticeAttempt } from "./practice-runtime-model";

export type {
  PersistedPracticeRun,
  PersistedPracticeRuntimeState,
  PracticeCheckpointFlight,
  PracticeRuntimeAttemptInput,
  PracticeRuntimeDraftChange,
  PracticeRuntimeStart,
  PracticeRuntimeVisit,
} from "./practice-runtime-types";
