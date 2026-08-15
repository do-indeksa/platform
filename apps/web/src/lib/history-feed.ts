import type { HistoryAttempt, HistoryAttemptOutcome } from "./history-journal";
import type { HistoryRunSummary } from "./history-run-summary";
import type { SimulationArchiveRun } from "./simulation-archive";

export const historyTabs = ["all", "tasks", "trainings", "mocks"] as const;
export type HistoryTab = (typeof historyTabs)[number];
export const historyPeriods = ["all", "7d", "30d", "90d"] as const;
export type HistoryPeriod = (typeof historyPeriods)[number];
export const historyDifficulties = ["all", "easy", "medium", "hard"] as const;
export type HistoryDifficulty = (typeof historyDifficulties)[number];

export type HistoryFeedFilters = {
  subject: "all" | "p1";
  period: HistoryPeriod;
  difficulty: HistoryDifficulty;
};

export type HistoryTaskMeta = {
  id: string;
  slot: number;
  topic: string;
  topicName: string;
  difficulty: number;
};

export type HistoryTaskFeedItem = {
  kind: "task";
  id: string;
  at: number;
  taskId: string;
  slot: number;
  topicName: string;
  outcome: HistoryAttemptOutcome;
  source: HistoryAttempt["source"];
  helpLevel: number;
  taskRevision?: string;
};

export type HistoryTrainingFeedItem = {
  kind: "training";
  id: string;
  at: number;
  runKind: "PRACTICE" | "DIAGNOSTIC";
  taskIds: string[];
  itemCount: number;
  completedItemCount: number;
  correctItemCount: number;
  earnedPoints?: number;
  maxPoints?: number;
};

export type HistoryMockFeedItem = {
  kind: "mock";
  id: string;
  at: number;
  run: SimulationArchiveRun;
};

export type HistoryFeedItem =
  HistoryTaskFeedItem | HistoryTrainingFeedItem | HistoryMockFeedItem;

const periodDays: Record<Exclude<HistoryPeriod, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function buildHistoryFeed({
  attempts,
  runs,
  mocks,
  tasks,
}: {
  attempts: readonly HistoryAttempt[];
  runs: readonly HistoryRunSummary[];
  mocks: readonly SimulationArchiveRun[];
  tasks: readonly HistoryTaskMeta[];
}): HistoryFeedItem[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const taskItems: HistoryTaskFeedItem[] = attempts.flatMap((attempt) => {
    const task = taskById.get(attempt.taskId);
    const at = Date.parse(attempt.at);
    if (!task || !Number.isFinite(at)) return [];
    return [
      {
        kind: "task",
        id: attempt.id,
        at,
        taskId: attempt.taskId,
        slot: attempt.slot,
        topicName: task.topicName,
        outcome: attempt.outcome,
        source: attempt.source,
        helpLevel: attempt.helpLevel,
        ...(attempt.taskRevision === undefined
          ? {}
          : { taskRevision: attempt.taskRevision }),
      },
    ];
  });
  const trainingItems: HistoryTrainingFeedItem[] = runs.flatMap((run) => {
    if (
      run.status !== "SUBMITTED" ||
      (run.kind !== "PRACTICE" && run.kind !== "DIAGNOSTIC") ||
      run.submittedAt === undefined
    ) {
      return [];
    }
    return [
      {
        kind: "training",
        id: run.id,
        at: Date.parse(run.submittedAt),
        runKind: run.kind,
        taskIds: [...run.taskIds],
        itemCount: run.itemCount,
        completedItemCount: run.completedItemCount,
        correctItemCount: run.correctItemCount,
        ...(run.earnedPoints === undefined
          ? {}
          : { earnedPoints: run.earnedPoints }),
        ...(run.maxPoints === undefined ? {} : { maxPoints: run.maxPoints }),
      },
    ];
  });
  const mockItems = mocks.map((run): HistoryMockFeedItem => ({
    kind: "mock",
    id: run.id,
    at: run.finishedAt,
    run,
  }));

  return [...taskItems, ...trainingItems, ...mockItems].toSorted(
    (left, right) => right.at - left.at || left.id.localeCompare(right.id),
  );
}

export function filterHistoryFeed(
  items: readonly HistoryFeedItem[],
  tab: HistoryTab,
  filters: HistoryFeedFilters,
  tasks: readonly HistoryTaskMeta[],
  nowMs: number,
): HistoryFeedItem[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const minDifficulty =
    filters.difficulty === "easy"
      ? 1
      : filters.difficulty === "medium"
        ? 3
        : filters.difficulty === "hard"
          ? 5
          : null;
  const maxDifficulty =
    filters.difficulty === "easy"
      ? 2
      : filters.difficulty === "medium"
        ? 4
        : filters.difficulty === "hard"
          ? 5
          : null;
  const periodStart =
    filters.period === "all" || !Number.isFinite(nowMs)
      ? null
      : nowMs - periodDays[filters.period] * 24 * 60 * 60 * 1_000;

  return items.filter((item) => {
    if (tab === "tasks" && item.kind !== "task") return false;
    if (tab === "trainings" && item.kind !== "training") return false;
    if (tab === "mocks" && item.kind !== "mock") return false;
    if (periodStart !== null && (item.at < periodStart || item.at > nowMs)) {
      return false;
    }
    if (minDifficulty === null || maxDifficulty === null) return true;
    const taskIds = itemTaskIds(item);
    return taskIds.some((taskId) => {
      const difficulty = taskById.get(taskId)?.difficulty;
      return (
        difficulty !== undefined &&
        difficulty >= minDifficulty &&
        difficulty <= maxDifficulty
      );
    });
  });
}

export function parseHistoryTab(value: unknown): HistoryTab {
  if (value === "variants") return "mocks";
  return typeof value === "string" && historyTabs.includes(value as HistoryTab)
    ? (value as HistoryTab)
    : "all";
}

export function parseHistoryFeedFilters(
  query: Record<string, string | string[] | undefined>,
): HistoryFeedFilters {
  const subject = first(query.subject);
  const period = first(query.period);
  const difficulty = first(query.difficulty);
  return {
    subject: subject === "p1" ? "p1" : "all",
    period:
      typeof period === "string" &&
      historyPeriods.includes(period as HistoryPeriod)
        ? (period as HistoryPeriod)
        : "all",
    difficulty:
      typeof difficulty === "string" &&
      historyDifficulties.includes(difficulty as HistoryDifficulty)
        ? (difficulty as HistoryDifficulty)
        : "all",
  };
}

export function historyHref(
  tab: HistoryTab,
  filters: HistoryFeedFilters,
): string {
  const query = new URLSearchParams();
  if (tab !== "all") query.set("tab", tab);
  if (filters.subject !== "all") query.set("subject", filters.subject);
  if (filters.period !== "all") query.set("period", filters.period);
  if (filters.difficulty !== "all") {
    query.set("difficulty", filters.difficulty);
  }
  const suffix = query.toString();
  return suffix ? `/history?${suffix}` : "/history";
}

export function hasHistoryFeedFilters(filters: HistoryFeedFilters): boolean {
  return (
    filters.subject !== "all" ||
    filters.period !== "all" ||
    filters.difficulty !== "all"
  );
}

function itemTaskIds(item: HistoryFeedItem): readonly string[] {
  if (item.kind === "task") return [item.taskId];
  if (item.kind === "training") return item.taskIds;
  return item.run.taskIds;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
