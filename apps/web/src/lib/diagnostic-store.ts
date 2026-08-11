"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DIAGNOSTIC_TASK_COUNT,
  isDiagnosticRunId,
  isDiagnosticTaskId,
} from "./diagnostic-run";
import {
  isLearningRunOwner,
  learningRunOwnerTransition,
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";
import { MAX_ANSWER_LENGTH, MAX_TASK_ANSWER_PARTS } from "./task-draft";

export const DIAGNOSTIC_STORE_VERSION = 2;

export type DiagnosticOutcome = "correct" | "incorrect" | "skipped";
export type DiagnosticPhase = "running" | "done";

export type DiagnosticStart = {
  runId: string;
  taskIds: string[];
  slots: number[];
  answerPartCounts: number[];
};

export type PersistedDiagnosticState = {
  runId: string | null;
  runOwnerId: string | null;
  taskIds: string[];
  slots: number[];
  answers: string[][];
  outcomes: (DiagnosticOutcome | null)[];
  completedAt: (number | null)[];
  phase: DiagnosticPhase | null;
  currentIndex: number;
  startedAt: number | null;
};

type DiagnosticState = PersistedDiagnosticState & {
  authOwnerId: string | null | undefined;
  syncOwner: (userId: string | null) => void;
  start: (run: DiagnosticStart) => void;
  setAnswer: (taskIndex: number, partIndex: number, value: string) => void;
  completeCurrent: (taskId: string, outcome: DiagnosticOutcome) => void;
  reset: () => void;
};

const OUTCOMES = new Set<DiagnosticOutcome>([
  "correct",
  "incorrect",
  "skipped",
]);

const emptyState = (): PersistedDiagnosticState => ({
  runId: null,
  runOwnerId: null,
  taskIds: [],
  slots: [],
  answers: [],
  outcomes: [],
  completedAt: [],
  phase: null,
  currentIndex: 0,
  startedAt: null,
});

export const useDiagnostic = create<DiagnosticState>()(
  persist(
    (set, get) => ({
      ...emptyState(),
      authOwnerId: undefined,
      syncOwner: (userId) => {
        const reconciled = reconcileDiagnosticOwner(get(), userId);
        set({ ...reconciled.runtime, authOwnerId: reconciled.ownerId });
      },
      start: ({ runId, taskIds, slots, answerPartCounts }) => {
        const current = get();
        if (current.authOwnerId === undefined) return;
        if (
          current.phase === "running" ||
          (current.phase === "done" && current.runId === runId)
        ) {
          return;
        }
        set({
          runId,
          runOwnerId: current.authOwnerId,
          taskIds: [...taskIds],
          slots: [...slots],
          answers: answerPartCounts.map((count) =>
            Array<string>(count).fill(""),
          ),
          outcomes: Array<null>(taskIds.length).fill(null),
          completedAt: Array<null>(taskIds.length).fill(null),
          phase: "running",
          currentIndex: 0,
          startedAt: Date.now(),
        });
      },
      setAnswer: (taskIndex, partIndex, value) => {
        if (value.length > MAX_ANSWER_LENGTH) return;
        const { answers, phase } = get();
        if (
          phase !== "running" ||
          taskIndex < 0 ||
          taskIndex >= answers.length ||
          partIndex < 0 ||
          partIndex >= answers[taskIndex].length
        ) {
          return;
        }
        const nextTaskAnswers = answers[taskIndex].with(partIndex, value);
        set({ answers: answers.with(taskIndex, nextTaskAnswers) });
      },
      completeCurrent: (taskId, outcome) => {
        const state = get();
        if (
          state.phase !== "running" ||
          state.taskIds[state.currentIndex] !== taskId
        ) {
          return;
        }
        const outcomes = state.outcomes.with(state.currentIndex, outcome);
        const previousCompletedAt =
          state.currentIndex === 0
            ? state.startedAt
            : state.completedAt[state.currentIndex - 1];
        const completedAt = state.completedAt.with(
          state.currentIndex,
          Math.max(Date.now(), previousCompletedAt ?? 0),
        );
        const done = state.currentIndex === state.taskIds.length - 1;
        set({
          outcomes,
          completedAt,
          phase: done ? "done" : "running",
          currentIndex: done ? state.currentIndex : state.currentIndex + 1,
        });
      },
      reset: () => set(emptyState()),
    }),
    {
      name: "do-indeksa-diagnostic",
      version: DIAGNOSTIC_STORE_VERSION,
      partialize: (state): PersistedDiagnosticState => ({
        runId: state.runId,
        runOwnerId: state.runOwnerId,
        taskIds: state.taskIds,
        slots: state.slots,
        answers: state.answers,
        outcomes: state.outcomes,
        completedAt: state.completedAt,
        phase: state.phase,
        currentIndex: state.currentIndex,
        startedAt: state.startedAt,
      }),
      migrate: migrateDiagnosticState,
      merge: (persisted, current) => ({
        ...current,
        ...parsePersistedDiagnosticState(persisted),
      }),
    },
  ),
);

export function parsePersistedDiagnosticState(
  value: unknown,
): PersistedDiagnosticState {
  if (!isRecord(value) || value.phase === null) return emptyState();
  if (
    !isDiagnosticRunId(value.runId) ||
    !isLearningRunOwner(value.runOwnerId) ||
    !Array.isArray(value.taskIds) ||
    value.taskIds.length !== DIAGNOSTIC_TASK_COUNT ||
    !value.taskIds.every(isDiagnosticTaskId) ||
    new Set(value.taskIds).size !== value.taskIds.length ||
    !isSlots(value.slots) ||
    !isAnswers(value.answers) ||
    !isOutcomes(value.outcomes) ||
    (value.phase !== "running" && value.phase !== "done") ||
    !Number.isInteger(value.currentIndex) ||
    (value.currentIndex as number) < 0 ||
    (value.currentIndex as number) >= DIAGNOSTIC_TASK_COUNT ||
    !isClientTime(value.startedAt)
  ) {
    return emptyState();
  }

  const currentIndex = value.currentIndex as number;
  const outcomes = value.outcomes as (DiagnosticOutcome | null)[];
  const completedAt = parseCompletedAt(
    value.completedAt,
    outcomes,
    value.startedAt,
  );
  if (completedAt === null) return emptyState();
  if (value.phase === "done" && currentIndex !== DIAGNOSTIC_TASK_COUNT - 1) {
    return emptyState();
  }
  const hasValidSequence = outcomes.every((outcome, index) => {
    if (value.phase === "done") return outcome !== null;
    return index < currentIndex ? outcome !== null : outcome === null;
  });
  if (!hasValidSequence) return emptyState();

  return {
    runId: value.runId,
    runOwnerId: value.runOwnerId,
    taskIds: [...value.taskIds],
    slots: [...value.slots],
    answers: value.answers.map((answers) => [...answers]),
    outcomes: [...outcomes],
    completedAt,
    phase: value.phase,
    currentIndex,
    startedAt: value.startedAt,
  };
}

export function migrateDiagnosticState(
  value: unknown,
  version: number,
): PersistedDiagnosticState {
  return version < DIAGNOSTIC_STORE_VERSION
    ? emptyState()
    : parsePersistedDiagnosticState(value);
}

export function syncDiagnosticOwner(userId: string | null): void {
  useDiagnostic.getState().syncOwner(userId);
}

export function useDiagnosticOwnerKnown(): boolean {
  return useDiagnostic((state) => state.authOwnerId !== undefined);
}

export function reconcileDiagnosticOwner(
  state: PersistedDiagnosticState,
  userId: string | null,
): { ownerId: LearningRunOwnerId; runtime: PersistedDiagnosticState } {
  const parsedOwnerId = parseLearningRunOwner(userId);
  const ownerId = parsedOwnerId ?? null;
  if (
    parsedOwnerId === undefined ||
    (state.phase !== null &&
      learningRunOwnerTransition(state.runOwnerId, ownerId) === "clear")
  ) {
    return { ownerId, runtime: emptyState() };
  }
  if (state.phase === null) return { ownerId, runtime: state };
  return {
    ownerId,
    runtime:
      state.runOwnerId === null && ownerId !== null
        ? { ...state, runOwnerId: ownerId }
        : state,
  };
}

function parseCompletedAt(
  value: unknown,
  outcomes: readonly (DiagnosticOutcome | null)[],
  startedAt: number,
): (number | null)[] | null {
  const completedAt =
    value === undefined
      ? outcomes.map((outcome) => (outcome === null ? null : startedAt))
      : value;
  if (
    !Array.isArray(completedAt) ||
    completedAt.length !== DIAGNOSTIC_TASK_COUNT
  ) {
    return null;
  }
  let previous = startedAt;
  for (const [index, timestamp] of completedAt.entries()) {
    if ((outcomes[index] === null) !== (timestamp === null)) return null;
    if (timestamp === null) continue;
    if (!isClientTime(timestamp) || timestamp < previous) return null;
    previous = timestamp;
  }
  return [...completedAt] as (number | null)[];
}

function isClientTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Date.now() + 5 * 60_000
  );
}

function isSlots(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DIAGNOSTIC_TASK_COUNT &&
    value.every((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10) &&
    new Set(value).size === value.length
  );
}

function isAnswers(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.length === DIAGNOSTIC_TASK_COUNT &&
    value.every(
      (answers) =>
        Array.isArray(answers) &&
        answers.length >= 1 &&
        answers.length <= MAX_TASK_ANSWER_PARTS &&
        answers.every(
          (answer) =>
            typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
        ),
    )
  );
}

function isOutcomes(value: unknown): value is (DiagnosticOutcome | null)[] {
  return (
    Array.isArray(value) &&
    value.length === DIAGNOSTIC_TASK_COUNT &&
    value.every(
      (outcome) =>
        outcome === null ||
        (typeof outcome === "string" &&
          OUTCOMES.has(outcome as DiagnosticOutcome)),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
