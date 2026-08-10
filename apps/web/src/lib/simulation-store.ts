import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordAttempts } from "./attempts-store";
import { binaryTrainerEstimate } from "./scoring";

export const EXAM_DURATION_MS = 240 * 60 * 1000;
export const DIAGNOSTIC_DURATION_MS = 40 * 60 * 1000;

const LEGACY_EXAM_EXTENSION_MS = 60 * 60 * 1000;

export type RunKind = "simulation" | "diagnostic";

const RUN_DURATION_MS: Record<RunKind, number> = {
  simulation: EXAM_DURATION_MS,
  diagnostic: DIAGNOSTIC_DURATION_MS,
};

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

type PersistedSimulationState = Pick<
  SimulationState,
  "kind" | "tasks" | "marks" | "phase" | "endsAt" | "currentIndex" | "history"
>;

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
      version: 3,
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

  const legacy = persisted as Partial<PersistedSimulationState>;
  const kind = version === 1 ? "simulation" : legacy.kind;
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
    kind === "simulation" &&
    legacy.phase === "running" &&
    typeof legacy.endsAt === "number" &&
    Number.isFinite(legacy.endsAt);

  return {
    kind: kind ?? "simulation",
    tasks,
    marks: Array.isArray(legacy.marks) ? legacy.marks : [],
    phase: legacy.phase ?? null,
    endsAt: shouldExtendDeadline
      ? (legacy.endsAt as number) + LEGACY_EXAM_EXTENSION_MS
      : (legacy.endsAt ?? null),
    currentIndex:
      typeof legacy.currentIndex === "number" ? legacy.currentIndex : 0,
    history: Array.isArray(legacy.history) ? legacy.history : [],
  };
}

function emptyPersistedState(
  history: HistoryEntry[] = [],
): PersistedSimulationState {
  return {
    kind: "simulation",
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
