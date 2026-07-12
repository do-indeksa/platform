import { create } from "zustand";
import { persist } from "zustand/middleware";
import { simulationScore } from "@/lib/scoring";

export const EXAM_DURATION_MS = 180 * 60 * 1000;

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
  tasks: SimulationTask[];
  marks: (boolean | null)[];
  phase: Phase | null;
  endsAt: number | null;
  currentIndex: number;
  history: HistoryEntry[];
  start: (tasks: SimulationTask[]) => void;
  goTo: (index: number) => void;
  submit: () => void;
  mark: (index: number, correct: boolean) => void;
  finish: () => void;
  reset: () => void;
};

export const useSimulation = create<SimulationState>()(
  persist(
    (set, get) => ({
      tasks: [],
      marks: [],
      phase: null,
      endsAt: null,
      currentIndex: 0,
      history: [],
      start: (tasks) =>
        set({
          tasks,
          marks: Array(tasks.length).fill(null),
          phase: "running",
          endsAt: Date.now() + EXAM_DURATION_MS,
          currentIndex: 0,
        }),
      goTo: (index) => set({ currentIndex: index }),
      submit: () => set({ phase: "grading", endsAt: null, currentIndex: 0 }),
      mark: (index, correct) =>
        set({ marks: get().marks.with(index, correct) }),
      finish: () => {
        const { tasks, marks, history } = get();
        const entry: HistoryEntry = {
          finishedAt: Date.now(),
          score: simulationScore(marks),
          taskIds: tasks.map((task) => task.id),
        };
        set({ phase: "done", history: [entry, ...history] });
      },
      reset: () =>
        set({
          tasks: [],
          marks: [],
          phase: null,
          endsAt: null,
          currentIndex: 0,
        }),
    }),
    {
      name: "do-indeksa-simulation",
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          const { history } = persisted as { history?: HistoryEntry[] };
          return {
            tasks: [],
            marks: [],
            phase: null,
            endsAt: null,
            currentIndex: 0,
            history: history ?? [],
          };
        }
        return persisted as SimulationState;
      },
    },
  ),
);
