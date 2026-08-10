import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempts } from "./attempts-store";
import { binaryTrainerEstimate } from "./scoring";

export const EXAM_DURATION_MS = 240 * 60 * 1000;

const LEGACY_EXAM_EXTENSION_MS = 60 * 60 * 1000;

export type SimulationTask = {
  id: string;
  slot: number;
  examPosition: number;
  maxPoints: number;
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

type PersistedSimulationState = Pick<
  SimulationState,
  "tasks" | "marks" | "phase" | "endsAt" | "currentIndex" | "history"
>;

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
        recordAttempts(
          tasks.map((task, i) => ({
            taskId: task.id,
            slot: task.slot,
            correct: marks[i] === true,
            source: "simulation",
          })),
        );
        const entry: HistoryEntry = {
          finishedAt: Date.now(),
          score: binaryTrainerEstimate(
            marks,
            tasks.map((task) => task.maxPoints),
          ),
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
      version: 4,
      migrate: migrateSimulationState,
    },
  ),
);

export function migrateSimulationState(
  persisted: unknown,
  version: number,
): PersistedSimulationState {
  if (version === 0) {
    const history =
      isRecord(persisted) && Array.isArray(persisted.history)
        ? (persisted.history as HistoryEntry[])
        : [];
    return emptyPersistedState(history);
  }

  if (!isRecord(persisted)) return emptyPersistedState();

  const history = Array.isArray(persisted.history)
    ? (persisted.history as HistoryEntry[])
    : [];
  if (version < 4 && persisted.kind === "diagnostic") {
    return emptyPersistedState(history);
  }

  const legacy = persisted as Partial<PersistedSimulationState>;
  const tasks = Array.isArray(legacy.tasks)
    ? legacy.tasks.map((task) => ({
        ...task,
        examPosition:
          typeof task.examPosition === "number" ? task.examPosition : task.slot,
        maxPoints: typeof task.maxPoints === "number" ? task.maxPoints : 6,
      }))
    : [];
  const shouldExtendDeadline =
    version < 3 &&
    legacy.phase === "running" &&
    typeof legacy.endsAt === "number" &&
    Number.isFinite(legacy.endsAt);

  return {
    tasks,
    marks: Array.isArray(legacy.marks) ? legacy.marks : [],
    phase: legacy.phase ?? null,
    endsAt: shouldExtendDeadline
      ? (legacy.endsAt as number) + LEGACY_EXAM_EXTENSION_MS
      : (legacy.endsAt ?? null),
    currentIndex:
      typeof legacy.currentIndex === "number" ? legacy.currentIndex : 0,
    history,
  };
}

function emptyPersistedState(
  history: HistoryEntry[] = [],
): PersistedSimulationState {
  return {
    tasks: [],
    marks: [],
    phase: null,
    endsAt: null,
    currentIndex: 0,
    history,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
