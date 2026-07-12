import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempts } from "@/lib/attempts-store";
import { simulationScore } from "@/lib/scoring";

export const EXAM_DURATION_MS = 180 * 60 * 1000;
export const DIAGNOSTIC_DURATION_MS = 40 * 60 * 1000;

export type RunKind = "simulation" | "diagnostic";

const RUN_DURATION_MS: Record<RunKind, number> = {
  simulation: EXAM_DURATION_MS,
  diagnostic: DIAGNOSTIC_DURATION_MS,
};

export type SimulationTask = {
  id: string;
  slot: number;
  topicName: string;
  statementHtml: string;
  solutionHtml: string;
  answer: string;
};

export type Phase = "running" | "grading" | "done";

export type HistoryEntry = {
  finishedAt: number;
  score: number;
  taskIds: string[];
};

type SimulationState = {
  kind: RunKind;
  tasks: SimulationTask[];
  marks: (boolean | null)[];
  phase: Phase | null;
  endsAt: number | null;
  currentIndex: number;
  history: HistoryEntry[];
  start: (tasks: SimulationTask[], kind: RunKind) => void;
  goTo: (index: number) => void;
  submit: () => void;
  mark: (index: number, correct: boolean) => void;
  finish: () => void;
  reset: () => void;
};

export const useSimulation = create<SimulationState>()(
  persist(
    (set, get) => ({
      kind: "simulation",
      tasks: [],
      marks: [],
      phase: null,
      endsAt: null,
      currentIndex: 0,
      history: [],
      start: (tasks, kind) =>
        set({
          kind,
          tasks,
          marks: Array(tasks.length).fill(null),
          phase: "running",
          endsAt: Date.now() + RUN_DURATION_MS[kind],
          currentIndex: 0,
        }),
      goTo: (index) => set({ currentIndex: index }),
      submit: () => set({ phase: "grading", endsAt: null, currentIndex: 0 }),
      mark: (index, correct) =>
        set({ marks: get().marks.with(index, correct) }),
      finish: () => {
        const { kind, tasks, marks, history } = get();
        recordAttempts(
          tasks.map((task, i) => ({
            taskId: task.id,
            slot: task.slot,
            correct: marks[i] === true,
            source: kind,
          })),
        );
        if (kind !== "simulation") {
          set({ phase: "done" });
          return;
        }
        const entry: HistoryEntry = {
          finishedAt: Date.now(),
          score: simulationScore(marks),
          taskIds: tasks.map((task) => task.id),
        };
        set({ phase: "done", history: [entry, ...history] });
      },
      reset: () =>
        set({
          kind: "simulation",
          tasks: [],
          marks: [],
          phase: null,
          endsAt: null,
          currentIndex: 0,
        }),
    }),
    {
      name: "do-indeksa-simulation",
      version: 2,
      migrate: (persisted, version) => {
        if (version === 0) {
          const { history } = persisted as { history?: HistoryEntry[] };
          return {
            kind: "simulation" as const,
            tasks: [],
            marks: [],
            phase: null,
            endsAt: null,
            currentIndex: 0,
            history: history ?? [],
          };
        }
        if (version === 1) {
          return {
            ...(persisted as Omit<SimulationState, "kind">),
            kind: "simulation" as const,
          };
        }
        return persisted as SimulationState;
      },
    },
  ),
);
