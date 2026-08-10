"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempts } from "./attempts-store";
import {
  emptySimulationState,
  migrateSimulationState,
  parsePersistedSimulationState,
  SIMULATION_HISTORY_LIMIT,
  type PersistedSimulationState,
} from "./simulation-persistence";
import {
  parseSimulationGradeItems,
  parseSimulationReviewItems,
  type SimulationGradeItem,
  type SimulationHistoryEntry,
  type SimulationPhase,
  type SimulationReviewItem,
  type SimulationTaskView,
} from "./simulation-types";
import { MAX_ANSWER_LENGTH } from "./task-draft";

export const SIMULATION_STORE_VERSION = 5;

export type SimulationStart = {
  runId: string;
  blueprintVersion: string;
  durationMinutes: number;
  tasks: SimulationTaskView[];
};

type SimulationState = PersistedSimulationState & {
  start: (input: SimulationStart) => void;
  setAnswer: (taskIndex: number, partIndex: number, value: string) => void;
  goTo: (index: number) => void;
  saveAndNext: () => void;
  skipCurrent: () => void;
  beginSubmission: (timedOut: boolean) => boolean;
  finish: (
    results: SimulationGradeItem[],
    review: SimulationReviewItem[],
    finishedAt: number,
  ) => boolean;
  reset: () => void;
};

export const useSimulation = create<SimulationState>()(
  persist(
    (set, get) => ({
      ...emptySimulationState(),
      start: ({ runId, blueprintVersion, durationMinutes, tasks }) => {
        const current = get();
        if (
          (current.phase === "running" || current.phase === "submitting") &&
          current.runId !== runId
        ) {
          return;
        }
        if (current.runId === runId && current.phase !== null) return;
        const startedAt = Date.now();
        set({
          ...emptySimulationState(current.history),
          runId,
          blueprintVersion,
          tasks: tasks.map((task) => ({
            ...task,
            fields: task.fields.map((field) => ({ ...field })),
          })),
          answers: tasks.map((task) =>
            Array<string>(task.fields.length).fill(""),
          ),
          skipped: Array<boolean>(tasks.length).fill(false),
          phase: "running",
          startedAt,
          endsAt: startedAt + durationMinutes * 60 * 1_000,
        });
      },
      setAnswer: (taskIndex, partIndex, value) => {
        const state = get();
        if (
          state.phase !== "running" ||
          taskIndex < 0 ||
          taskIndex >= state.answers.length ||
          partIndex < 0 ||
          partIndex >= state.answers[taskIndex].length ||
          value.length > MAX_ANSWER_LENGTH
        ) {
          return;
        }
        set({
          answers: state.answers.with(
            taskIndex,
            state.answers[taskIndex].with(partIndex, value),
          ),
          skipped: state.skipped.with(taskIndex, false),
          savedAt: Date.now(),
        });
      },
      goTo: (index) => {
        const state = get();
        if (
          state.phase === "running" &&
          index >= 0 &&
          index < state.tasks.length
        ) {
          set({ currentIndex: index });
        }
      },
      saveAndNext: () => {
        const state = get();
        if (state.phase !== "running") return;
        const answered = state.answers[state.currentIndex].some(
          (answer) => answer.trim() !== "",
        );
        set({
          skipped: state.skipped.with(state.currentIndex, !answered),
          savedAt: Date.now(),
          currentIndex: Math.min(
            state.currentIndex + 1,
            state.tasks.length - 1,
          ),
        });
      },
      skipCurrent: () => {
        const state = get();
        if (state.phase !== "running") return;
        set({
          answers: state.answers.with(
            state.currentIndex,
            state.answers[state.currentIndex].map(() => ""),
          ),
          skipped: state.skipped.with(state.currentIndex, true),
          savedAt: Date.now(),
          currentIndex: Math.min(
            state.currentIndex + 1,
            state.tasks.length - 1,
          ),
        });
      },
      beginSubmission: (timedOut) => {
        if (get().phase !== "running") return false;
        set({ phase: "submitting", timedOut });
        return true;
      },
      finish: (results, review, finishedAt) => {
        const state = get();
        if (
          state.phase !== "submitting" ||
          state.runId === null ||
          state.blueprintVersion === null ||
          state.startedAt === null ||
          !Number.isFinite(finishedAt) ||
          finishedAt < state.startedAt ||
          parseSimulationGradeItems(results, state.tasks) === null ||
          parseSimulationReviewItems(review, state.tasks) === null
        ) {
          return false;
        }
        recordAttempts(
          results.flatMap((result, index) => {
            if (result.outcome === "unanswered") return [];
            const task = state.tasks[index];
            return {
              taskId: result.taskId,
              slot: task.slot,
              correct: result.outcome === "correct",
              source: "simulation" as const,
            };
          }),
        );
        const entry = buildHistoryEntry(state, results, finishedAt);
        set({
          phase: "done",
          endsAt: null,
          submittedAt: finishedAt,
          results: results.map((result) => ({ ...result })),
          review: review.map((item) => ({ ...item })),
          history: [
            entry,
            ...state.history.filter((item) => item.id !== entry.id),
          ].slice(0, SIMULATION_HISTORY_LIMIT),
        });
        return true;
      },
      reset: () => set(emptySimulationState(get().history)),
    }),
    {
      name: "do-indeksa-simulation",
      version: SIMULATION_STORE_VERSION,
      partialize: (state): PersistedSimulationState => persisted(state),
      migrate: migrateSimulationState,
      merge: (value, current) => ({
        ...current,
        ...parsePersistedSimulationState(value),
      }),
    },
  ),
);

export function isSimulationActive(phase: SimulationPhase | null): boolean {
  return phase === "running" || phase === "submitting";
}

function buildHistoryEntry(
  state: PersistedSimulationState,
  results: SimulationGradeItem[],
  finishedAt: number,
): SimulationHistoryEntry {
  const maxDuration = Math.max(
    0,
    (state.endsAt ?? finishedAt) - (state.startedAt ?? finishedAt),
  );
  return {
    id: state.runId as string,
    blueprintVersion: state.blueprintVersion as string,
    startedAt: state.startedAt as number,
    finishedAt,
    durationMs: Math.min(
      Math.max(0, finishedAt - (state.startedAt as number)),
      maxDuration,
    ),
    timedOut: state.timedOut,
    score: results.reduce((sum, result) => sum + result.earnedPoints, 0),
    maxPoints: results.reduce((sum, result) => sum + result.maxPoints, 0),
    correctCount: results.filter((result) => result.outcome === "correct")
      .length,
    answeredCount: results.filter((result) => result.outcome !== "unanswered")
      .length,
    taskIds: state.tasks.map((task) => task.id),
    answers: state.answers.map((answers) => [...answers]),
    results: results.map((result) => ({ ...result })),
  };
}

function persisted(state: PersistedSimulationState): PersistedSimulationState {
  return {
    runId: state.runId,
    blueprintVersion: state.blueprintVersion,
    tasks: state.tasks,
    answers: state.answers,
    skipped: state.skipped,
    phase: state.phase,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    submittedAt: state.submittedAt,
    currentIndex: state.currentIndex,
    savedAt: state.savedAt,
    timedOut: state.timedOut,
    results: state.results,
    review: state.review,
    history: state.history,
  };
}

export { migrateSimulationState } from "./simulation-persistence";
export type {
  SimulationGradeItem,
  SimulationHistoryEntry,
  SimulationPhase,
  SimulationReviewItem,
  SimulationTaskView,
} from "./simulation-types";
