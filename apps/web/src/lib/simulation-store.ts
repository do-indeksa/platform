"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  emptySimulationState,
  isSimulationCheckpointVersion,
  migrateSimulationState,
  parsePersistedSimulationState,
  SIMULATION_HISTORY_LIMIT,
  type PersistedSimulationState,
} from "./simulation-persistence";
import { isSimulationRunId } from "./simulation-run";
import {
  applySimulationRubric,
  normalizeSimulationRubricScores,
  simulationRubricIndexes,
} from "./simulation-rubric";
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
import {
  learningRunOwnerTransition,
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";

export const SIMULATION_STORE_VERSION = 10;

export type SimulationStart = {
  runId: string;
  blueprintVersion: string;
  contentRevision: string;
  durationMinutes: number;
  tasks: SimulationTaskView[];
};

type SimulationState = PersistedSimulationState & {
  authOwnerId: string | null | undefined;
  syncOwner: (userId: string | null) => void;
  start: (input: SimulationStart) => void;
  setAnswer: (taskIndex: number, partIndex: number, value: string) => void;
  goTo: (index: number) => void;
  saveAndNext: () => void;
  skipCurrent: () => void;
  beginSubmission: (timedOut: boolean, submittedAt: number) => boolean;
  receiveGrade: (
    results: SimulationGradeItem[],
    review: SimulationReviewItem[],
  ) => boolean;
  setRubricScore: (taskIndex: number, score: number) => boolean;
  finishReview: () => boolean;
  restore: (state: PersistedSimulationState) => boolean;
  adoptCheckpointVersion: (runId: string, version: number) => boolean;
  fork: (runId: string) => boolean;
  reset: () => void;
};

export const useSimulation = create<SimulationState>()(
  persist(
    (set, get) => ({
      ...emptySimulationState(),
      authOwnerId: undefined,
      syncOwner: (userId) => {
        const reconciled = reconcileSimulationOwner(get(), userId);
        set({ ...reconciled.runtime, authOwnerId: reconciled.ownerId });
      },
      start: ({
        runId,
        blueprintVersion,
        contentRevision,
        durationMinutes,
        tasks,
      }) => {
        const current = get();
        if (current.authOwnerId === undefined) return;
        if (isSimulationActive(current.phase) && current.runId !== runId) {
          return;
        }
        if (current.runId === runId && current.phase !== null) return;
        const startedAt = Date.now();
        set({
          ...emptySimulationState(current.history),
          runId,
          runOwnerId: current.authOwnerId,
          checkpointVersion: 0,
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
      beginSubmission: (timedOut, submittedAt) => {
        const state = get();
        if (
          state.phase !== "running" ||
          state.startedAt === null ||
          state.endsAt === null ||
          !Number.isSafeInteger(submittedAt) ||
          submittedAt < state.startedAt
        ) {
          return false;
        }
        set({
          phase: "submitting",
          submittedAt,
          timedOut: timedOut || submittedAt >= state.endsAt,
          rubricScores: [],
        });
        return true;
      },
      receiveGrade: (results, review) => {
        const state = get();
        const parsedResults = parseSimulationGradeItems(results, state.tasks);
        const parsedReview = parseSimulationReviewItems(review, state.tasks);
        if (
          state.phase !== "submitting" ||
          state.runId === null ||
          state.blueprintVersion === null ||
          state.contentRevision === null ||
          state.startedAt === null ||
          state.submittedAt === null ||
          parsedResults === null ||
          parsedReview === null
        ) {
          return false;
        }
        const recoveredScores =
          state.rubricScores.length === state.tasks.length
            ? state.rubricScores
            : Array<null>(state.tasks.length).fill(null);
        const rubricScores = normalizeSimulationRubricScores(
          parsedResults,
          parsedReview,
          recoveredScores,
        );
        if (rubricScores === null) return false;
        const indexes = simulationRubricIndexes(parsedResults, parsedReview);
        set({
          phase: "reviewing",
          currentIndex: indexes[0] ?? 0,
          results: parsedResults.map((result) => ({ ...result })),
          review: parsedReview.map(cloneReviewItem),
          rubricScores,
        });
        return true;
      },
      setRubricScore: (taskIndex, score) => {
        const state = get();
        if (
          state.phase !== "reviewing" ||
          taskIndex < 0 ||
          taskIndex >= state.tasks.length ||
          !Number.isInteger(score)
        ) {
          return false;
        }
        const scores = state.rubricScores.with(taskIndex, score);
        if (
          normalizeSimulationRubricScores(
            state.results,
            state.review,
            scores,
          ) === null
        ) {
          return false;
        }
        set({ rubricScores: scores, savedAt: Date.now() });
        return true;
      },
      finishReview: () => {
        const state = get();
        if (
          state.phase !== "reviewing" ||
          state.submittedAt === null ||
          state.runId === null ||
          state.blueprintVersion === null ||
          state.contentRevision === null ||
          state.startedAt === null
        ) {
          return false;
        }
        const results = applySimulationRubric(
          state.results,
          state.review,
          state.rubricScores,
        );
        if (results === null) return false;
        const finishedAt = state.submittedAt;
        recordTaskHistory(
          results.flatMap((result, index) =>
            result.outcome === "partial"
              ? []
              : [
                  {
                    taskId: result.taskId,
                    slot: state.tasks[index].slot,
                    source: "simulation" as const,
                    outcome:
                      result.outcome === "unanswered"
                        ? ("skipped" as const)
                        : result.outcome,
                    answers: state.answers[index],
                    helpLevel: 0,
                    at: new Date(finishedAt).toISOString(),
                  },
                ],
          ),
        );
        const entry = buildHistoryEntry(
          state,
          results,
          finishedAt,
          state.runOwnerId,
          state.rubricScores,
        );
        set({
          phase: "done",
          endsAt: null,
          submittedAt: finishedAt,
          results: results.map((result) => ({ ...result })),
          review: state.review.map(cloneReviewItem),
          history: [
            entry,
            ...state.history.filter((item) => item.id !== entry.id),
          ].slice(0, SIMULATION_HISTORY_LIMIT),
        });
        return true;
      },
      restore: (state) => {
        const current = get();
        const parsed = parsePersistedSimulationState(state);
        if (
          current.authOwnerId === undefined ||
          !isSimulationActive(parsed.phase) ||
          parsed.runOwnerId !== current.authOwnerId
        ) {
          return false;
        }
        set({ ...parsed, history: current.history });
        return true;
      },
      adoptCheckpointVersion: (runId, version) => {
        const current = get();
        if (
          !isSimulationActive(current.phase) ||
          current.runId !== runId ||
          !isSimulationCheckpointVersion(version) ||
          version < current.checkpointVersion
        ) {
          return false;
        }
        set({ checkpointVersion: version });
        return true;
      },
      fork: (runId) => {
        const current = get();
        if (!isSimulationActive(current.phase) || !isSimulationRunId(runId)) {
          return false;
        }
        set({ runId, checkpointVersion: 0 });
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
  return phase === "running" || phase === "submitting" || phase === "reviewing";
}

export function syncSimulationOwner(userId: string | null): void {
  useSimulation.getState().syncOwner(userId);
}

export function useSimulationOwnerKnown(): boolean {
  return useSimulation((state) => state.authOwnerId !== undefined);
}

export function useSimulationHistory(): SimulationHistoryEntry[] | null {
  const history = useSimulation((state) => state.history);
  const ownerId = useSimulation((state) => state.authOwnerId);
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

export function reconcileSimulationOwner(
  state: PersistedSimulationState,
  userId: string | null,
): { ownerId: LearningRunOwnerId; runtime: PersistedSimulationState } {
  const parsedOwnerId = parseLearningRunOwner(userId);
  const ownerId = parsedOwnerId ?? null;
  const history = claimSimulationHistoryOwner(state.history, ownerId);
  if (parsedOwnerId === undefined) {
    return { ownerId, runtime: emptySimulationState(history) };
  }
  if (state.phase === null || state.runId === null) {
    return { ownerId, runtime: { ...state, history } };
  }

  const transition = learningRunOwnerTransition(state.runOwnerId, ownerId);
  if (transition === "clear") {
    return { ownerId, runtime: emptySimulationState(history) };
  }
  return {
    ownerId,
    runtime: {
      ...state,
      history,
      ...(transition === "claim" ? { runOwnerId: ownerId } : {}),
    },
  };
}

function buildHistoryEntry(
  state: PersistedSimulationState,
  results: SimulationGradeItem[],
  finishedAt: number,
  ownerId: string | null,
  rubricScores: (number | null)[],
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
    rubricScores: rubricScores.map((score) => score),
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
    runOwnerId: state.runOwnerId,
    checkpointVersion: state.checkpointVersion,
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
    rubricScores: state.rubricScores,
    history: state.history,
  };
}

function cloneReviewItem(item: SimulationReviewItem): SimulationReviewItem {
  return {
    ...item,
    rubric: item.rubric.map((criterion) => ({ ...criterion })),
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
