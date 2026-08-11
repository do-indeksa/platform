import type { HistoryAttempt } from "./history-journal";

export const taskHistoryOutcomeFilters = [
  "all",
  "correct",
  "incorrect",
  "partial",
  "skipped",
  "ungraded",
] as const;
export type TaskHistoryOutcomeFilter =
  (typeof taskHistoryOutcomeFilters)[number];

export const taskHistoryPeriodFilters = ["all", "7d", "30d", "90d"] as const;
export type TaskHistoryPeriodFilter = (typeof taskHistoryPeriodFilters)[number];

export type TaskHistoryFilters = {
  topic: string | null;
  outcome: TaskHistoryOutcomeFilter;
  period: TaskHistoryPeriodFilter;
};

export const defaultTaskHistoryFilters: TaskHistoryFilters = {
  topic: null,
  outcome: "all",
  period: "all",
};

type QueryInput = Record<string, string | string[] | undefined>;
type TaskTopic = { topic: string };

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const periodDays: Record<Exclude<TaskHistoryPeriodFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function parseTaskHistoryFilters(
  query: QueryInput,
  validTopics: ReadonlySet<string>,
): TaskHistoryFilters {
  const topicValue = firstQueryValue(query.topic);
  const outcomeValue = firstQueryValue(query.outcome);
  const periodValue = firstQueryValue(query.period);

  return {
    topic:
      topicValue !== undefined && validTopics.has(topicValue)
        ? topicValue
        : null,
    outcome: isTaskHistoryOutcomeFilter(outcomeValue) ? outcomeValue : "all",
    period: isTaskHistoryPeriodFilter(periodValue) ? periodValue : "all",
  };
}

export function serializeTaskHistoryFilters(
  filters: TaskHistoryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.topic !== null) params.set("topic", filters.topic);
  if (filters.outcome !== "all") params.set("outcome", filters.outcome);
  if (filters.period !== "all") params.set("period", filters.period);
  return params;
}

export function taskHistoryHref(filters: TaskHistoryFilters): string {
  const query = serializeTaskHistoryFilters(filters).toString();
  return query ? `/history?${query}` : "/history";
}

export function safeTaskHistoryReturnPath(
  value: string | undefined,
  validTopics: ReadonlySet<string>,
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const base = new URL("https://do-indeksa.invalid");
    const target = new URL(value, base);
    if (
      target.origin !== base.origin ||
      target.pathname !== "/history" ||
      target.hash
    ) {
      return null;
    }
    const allowedKeys = new Set(["topic", "outcome", "period"]);
    if (
      [...target.searchParams.keys()].some(
        (key) =>
          !allowedKeys.has(key) || target.searchParams.getAll(key).length !== 1,
      )
    ) {
      return null;
    }
    const topic = target.searchParams.get("topic");
    const outcome = target.searchParams.get("outcome");
    const period = target.searchParams.get("period");
    if (
      (topic !== null && !validTopics.has(topic)) ||
      (outcome !== null && !isTaskHistoryOutcomeFilter(outcome)) ||
      (period !== null && !isTaskHistoryPeriodFilter(period))
    ) {
      return null;
    }
    return taskHistoryHref(
      parseTaskHistoryFilters(
        {
          ...(topic === null ? {} : { topic }),
          ...(outcome === null ? {} : { outcome }),
          ...(period === null ? {} : { period }),
        },
        validTopics,
      ),
    );
  } catch {
    return null;
  }
}

export function filterTaskHistory(
  entries: readonly HistoryAttempt[],
  taskById: ReadonlyMap<string, TaskTopic>,
  filters: TaskHistoryFilters,
  nowMs: number,
): HistoryAttempt[] {
  if (filters.period !== "all" && !Number.isFinite(nowMs)) return [];
  const days = filters.period === "all" ? null : periodDays[filters.period];
  const periodStart =
    days === null ? null : nowMs - days * MILLISECONDS_PER_DAY;

  return entries.filter((entry) => {
    if (
      filters.topic !== null &&
      taskById.get(entry.taskId)?.topic !== filters.topic
    ) {
      return false;
    }
    if (filters.outcome !== "all" && entry.outcome !== filters.outcome) {
      return false;
    }
    if (periodStart === null) return true;
    const submittedAt = Date.parse(entry.at);
    return submittedAt >= periodStart && submittedAt <= nowMs;
  });
}

export function hasActiveTaskHistoryFilters(
  filters: TaskHistoryFilters,
): boolean {
  return (
    filters.topic !== null ||
    filters.outcome !== "all" ||
    filters.period !== "all"
  );
}

export function isTaskHistoryOutcomeFilter(
  value: unknown,
): value is TaskHistoryOutcomeFilter {
  return (
    typeof value === "string" &&
    taskHistoryOutcomeFilters.includes(value as TaskHistoryOutcomeFilter)
  );
}

export function isTaskHistoryPeriodFilter(
  value: unknown,
): value is TaskHistoryPeriodFilter {
  return (
    typeof value === "string" &&
    taskHistoryPeriodFilters.includes(value as TaskHistoryPeriodFilter)
  );
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
