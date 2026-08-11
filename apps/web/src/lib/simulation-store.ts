"use client";

import { useMemo } from "react";
import { validate as isUuid } from "uuid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
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
import { recordTaskHistory } from "./task-history-store";

export const SIMULATION_STORE_VERSION = 7;

export type SimulationStart = {
  runId: string;
  blueprintVersion: string;
  contentRevision: string;
  durationMinutes: number;
  tasks: SimulationTaskView[];
};

type SimulationState = PersistedSimulationState & {
  historyOwnerId: string | null | undefined;
  syncHistoryOwner: (userId: string | null) => void;
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
      historyOwnerId: undefined,
      syncHistoryOwner: (userId) => {
        const ownerId = userId === null || isUuid(userId) ? userId : null;
        const history = claimSimulationHistoryOwner(get().history, ownerId);
        set({ historyOwnerId: ownerId, history });
      },
      start: ({
        runId,
        blueprintVersion,
        contentRevision,
        durationMinutes,
        tasks,
      }) => {
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
          contentRevision,
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
          state.contentRevision === null ||
          state.startedAt === null ||
          !Number.isFinite(finishedAt) ||
          finishedAt < state.startedAt ||
          parseSimulationGradeItems(results, state.tasks) === null ||
          parseSimulationReviewItems(review, state.tasks) === null
        ) {
          return false;
        }
        recordTaskHistory(
          results.map((result, index) => ({
            taskId: result.taskId,
            slot: state.tasks[index].slot,
            source: "simulation" as const,
            outcome:
              result.outcome === "unanswered" ? "skipped" : result.outcome,
            answers: state.answers[index],
            helpLevel: 0,
            at: new Date(finishedAt).toISOString(),
          })),
        );
        const entry = buildHistoryEntry(
          state,
          results,
          finishedAt,
          state.historyOwnerId ?? null,
        );
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

export function syncSimulationHistoryOwner(userId: string | null): void {
  useSimulation.getState().syncHistoryOwner(userId);
}

export function useSimulationHistory(): SimulationHistoryEntry[] | null {
  const history = useSimulation((state) => state.history);
  const ownerId = useSimulation((state) => state.historyOwnerId);
  return useMemo(
    () => simulationHistoryForOwner(history, ownerId),
    [history, ownerId],
  );
}

export function simulationHistoryForOwner(
  history: readonly SimulationHistoryEntry[],
  ownerId: string | null | undefined,
): SimulationHistoryEntry[] | null {
  if (ownerId === undefined) return null;
  return history.filter((entry) => (entry.ownerId ?? null) === ownerId);
}

export function claimSimulationHistoryOwner(
  history: readonly SimulationHistoryEntry[],
  ownerId: string | null,
): SimulationHistoryEntry[] {
  if (ownerId === null) return [...history];
  return history.map((entry) =>
    entry.ownerId === undefined || entry.ownerId === null
      ? { ...entry, ownerId }
      : entry,
  );
}

function buildHistoryEntry(
  state: PersistedSimulationState,
  results: SimulationGradeItem[],
  finishedAt: number,
  ownerId: string | null,
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
    ownerId,
    progress: {
      contentRevision: state.contentRevision as string,
      items: state.tasks.map((task) => ({
        taskId: task.id,
        taskRevision: task.revision,
        slot: task.slot,
        examPosition: task.examPosition,
        topic: task.topic,
        maxPoints: task.maxPoints,
      })),
    },
  };
}

function persisted(state: PersistedSimulationState): PersistedSimulationState {
  return {
    runId: state.runId,
    blueprintVersion: state.blueprintVersion,
    contentRevision: state.contentRevision,
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
