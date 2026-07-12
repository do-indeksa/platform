import { create } from "zustand";
import { persist } from "zustand/middleware";
import { simulationScore } from "@/lib/scoring";

export const EXAM_DURATION_SECONDS = 180 * 60;

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
  remainingSeconds: number;
  currentIndex: number;
  history: HistoryEntry[];
  start: (tasks: SimulationTask[]) => void;
  goTo: (index: number) => void;
  tick: () => void;
  submit: () => void;
  mark: (index: number, correct: boolean) => void;
  finish: () => void;
  discard: () => void;
};

export const useSimulation = create<SimulationState>()(
  persist(
    (set, get) => ({
      tasks: [],
      marks: [],
      phase: null,
      remainingSeconds: EXAM_DURATION_SECONDS,
      currentIndex: 0,
      history: [],
      start: (tasks) =>
        set({
          tasks,
          marks: Array(tasks.length).fill(null),
          phase: "running",
          remainingSeconds: EXAM_DURATION_SECONDS,
          currentIndex: 0,
        }),
      goTo: (index) => set({ currentIndex: index }),
      tick: () => {
        const { remainingSeconds, phase } = get();
        if (phase !== "running") return;
        if (remainingSeconds <= 1) {
          set({ remainingSeconds: 0, phase: "grading", currentIndex: 0 });
          return;
        }
        set({ remainingSeconds: remainingSeconds - 1 });
      },
      submit: () => set({ phase: "grading", currentIndex: 0 }),
      mark: (index, correct) => {
        const marks = get().marks.with(index, correct);
        set({ marks });
      },
      finish: () => {
        const { tasks, marks, history } = get();
        const entry: HistoryEntry = {
          finishedAt: Date.now(),
          score: simulationScore(marks),
          taskIds: tasks.map((task) => task.id),
        };
        set({ phase: "done", history: [entry, ...history] });
      },
      discard: () =>
        set({
          tasks: [],
          marks: [],
          phase: null,
          remainingSeconds: EXAM_DURATION_SECONDS,
          currentIndex: 0,
        }),
    }),
    { name: "do-indeksa-simulation" },
  ),
);
