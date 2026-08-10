"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempts } from "./attempts-store";
import {
  DIAGNOSTIC_TASK_COUNT,
  isDiagnosticRunId,
  isDiagnosticTaskId,
} from "./diagnostic-run";
import { MAX_ANSWER_LENGTH, MAX_TASK_ANSWER_PARTS } from "./task-draft";

export type DiagnosticOutcome = "correct" | "incorrect" | "skipped";
export type DiagnosticPhase = "running" | "done";

export type DiagnosticStart = {
  runId: string;
  taskIds: string[];
  slots: number[];
  answerPartCounts: number[];
};

type PersistedDiagnosticState = {
  runId: string | null;
  taskIds: string[];
  slots: number[];
  answers: string[][];
  outcomes: (DiagnosticOutcome | null)[];
  phase: DiagnosticPhase | null;
  currentIndex: number;
  startedAt: number | null;
};

type DiagnosticState = PersistedDiagnosticState & {
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
  taskIds: [],
  slots: [],
  answers: [],
  outcomes: [],
  phase: null,
  currentIndex: 0,
  startedAt: null,
});

export const useDiagnostic = create<DiagnosticState>()(
  persist(
    (set, get) => ({
      ...emptyState(),
      start: ({ runId, taskIds, slots, answerPartCounts }) => {
        const current = get();
        if (
          current.phase === "running" ||
          (current.phase === "done" && current.runId === runId)
        ) {
          return;
        }
        set({
          runId,
          taskIds: [...taskIds],
          slots: [...slots],
          answers: answerPartCounts.map((count) =>
            Array<string>(count).fill(""),
          ),
          outcomes: Array<null>(taskIds.length).fill(null),
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
        const done = state.currentIndex === state.taskIds.length - 1;
        set({
          outcomes,
          phase: done ? "done" : "running",
          currentIndex: done ? state.currentIndex : state.currentIndex + 1,
        });
        if (!done) return;

        recordAttempts(
          outcomes.flatMap((result, index) =>
            result === "correct" || result === "incorrect"
              ? [
                  {
                    taskId: state.taskIds[index],
                    slot: state.slots[index],
                    correct: result === "correct",
                    source: "diagnostic" as const,
                  },
                ]
              : [],
          ),
        );
      },
      reset: () => set(emptyState()),
    }),
    {
      name: "do-indeksa-diagnostic",
      version: 1,
      partialize: (state): PersistedDiagnosticState => ({
        runId: state.runId,
        taskIds: state.taskIds,
        slots: state.slots,
        answers: state.answers,
        outcomes: state.outcomes,
        phase: state.phase,
        currentIndex: state.currentIndex,
        startedAt: state.startedAt,
      }),
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
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    value.startedAt <= 0
  ) {
    return emptyState();
  }

  const currentIndex = value.currentIndex as number;
  const outcomes = value.outcomes as (DiagnosticOutcome | null)[];
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
    taskIds: [...value.taskIds],
    slots: [...value.slots],
    answers: value.answers.map((answers) => [...answers]),
    outcomes: [...outcomes],
    phase: value.phase,
    currentIndex,
    startedAt: value.startedAt,
  };
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
