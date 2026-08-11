import type { TaskSummary } from "@/lib/content";
import type { Attempt } from "@/lib/knowledge";

export const TASK_BANK_PATH = "/tasks";
export const MAX_PRACTICE_SET_SIZE = 30;

export const difficultyBands = ["foundation", "exam", "advanced"] as const;
export type DifficultyBand = (typeof difficultyBands)[number];

export const progressFilters = ["all", "new", "correct", "incorrect"] as const;
export type ProgressFilter = (typeof progressFilters)[number];

export const taskSorts = ["position", "difficulty"] as const;
export type TaskSort = (typeof taskSorts)[number];

export type TaskProgress = Exclude<ProgressFilter, "all">;

export type TaskBankFilters = {
  query: string;
  positions: number[];
  topics: string[];
  difficulties: DifficultyBand[];
  progress: ProgressFilter;
  sort: TaskSort;
};

export const defaultTaskBankFilters: TaskBankFilters = {
  query: "",
  positions: [],
  topics: [],
  difficulties: [],
  progress: "all",
  sort: "position",
};

export function parseTaskBankState(
  params: URLSearchParams,
  topicSlots: ReadonlyMap<string, number>,
  validTaskIds: ReadonlySet<string>,
): { filters: TaskBankFilters; selectedTaskIds: string[] } {
  const positions = unique(
    params
      .getAll("position")
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10),
  ).toSorted((a, b) => a - b);
  const topics = unique(
    params.getAll("topic").filter((value) => topicSlots.has(value)),
  );
  const difficulties = unique(
    params
      .getAll("difficulty")
      .filter((value): value is DifficultyBand =>
        difficultyBands.includes(value as DifficultyBand),
      ),
  );
  const progressValue = params.get("progress");
  const progress = progressFilters.includes(progressValue as ProgressFilter)
    ? (progressValue as ProgressFilter)
    : "all";
  const sortValue = params.get("sort");
  const sort = taskSorts.includes(sortValue as TaskSort)
    ? (sortValue as TaskSort)
    : "position";
  const selectedTaskIds = unique(
    params.getAll("selected").filter((value) => validTaskIds.has(value)),
  ).slice(0, MAX_PRACTICE_SET_SIZE);

  return {
    filters: constrainTaskBankTopics(
      {
        query: (params.get("q") ?? "").trim().slice(0, 120),
        positions,
        topics,
        difficulties,
        progress,
        sort,
      },
      topicSlots,
    ),
    selectedTaskIds,
  };
}

export function constrainTaskBankTopics(
  filters: TaskBankFilters,
  topicSlots: ReadonlyMap<string, number>,
): TaskBankFilters {
  if (filters.positions.length === 0) return filters;
  return {
    ...filters,
    topics: filters.topics.filter((topic) => {
      const slot = topicSlots.get(topic);
      return slot !== undefined && filters.positions.includes(slot);
    }),
  };
}

export function serializeTaskBankState(
  filters: TaskBankFilters,
  selectedTaskIds: readonly string[],
): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set("q", query);
  for (const position of filters.positions.toSorted((a, b) => a - b)) {
    params.append("position", String(position));
  }
  for (const topic of filters.topics) params.append("topic", topic);
  for (const difficulty of filters.difficulties) {
    params.append("difficulty", difficulty);
  }
  if (filters.progress !== "all") params.set("progress", filters.progress);
  if (filters.sort !== "position") params.set("sort", filters.sort);
  for (const taskId of selectedTaskIds.slice(0, MAX_PRACTICE_SET_SIZE)) {
    params.append("selected", taskId);
  }
  return params;
}

export function taskBankHref(
  filters: TaskBankFilters,
  selectedTaskIds: readonly string[] = [],
): string {
  const query = serializeTaskBankState(filters, selectedTaskIds).toString();
  return query ? `${TASK_BANK_PATH}?${query}` : TASK_BANK_PATH;
}

export function taskPracticeHref(
  task: Pick<TaskSummary, "id" | "topic"> | undefined,
  returnTo: string,
  practiceSet: readonly string[] = [],
  practiceId?: string,
): string {
  if (!task) return TASK_BANK_PATH;
  const params = new URLSearchParams({ returnTo });
  if (practiceSet.length > 0) {
    params.set("set", practiceSet.slice(0, MAX_PRACTICE_SET_SIZE).join(","));
  }
  const validPracticeId = parsePracticeId(practiceId);
  if (validPracticeId) params.set("practice", validPracticeId);
  return `${TASK_BANK_PATH}/${task.topic}/${task.id}?${params}`;
}

export function parsePracticeId(value: string | undefined): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export function filterTaskSummaries(
  tasks: readonly TaskSummary[],
  topicLabels: Readonly<Record<string, string>>,
  filters: TaskBankFilters,
  attempts: readonly Attempt[],
): TaskSummary[] {
  const query = normalizeSearch(filters.query);
  const filtered = tasks.filter((task) => {
    if (
      filters.positions.length > 0 &&
      !filters.positions.includes(task.slot)
    ) {
      return false;
    }
    if (filters.topics.length > 0 && !filters.topics.includes(task.topic)) {
      return false;
    }
    if (
      filters.difficulties.length > 0 &&
      !filters.difficulties.includes(difficultyBand(task.difficulty))
    ) {
      return false;
    }
    if (
      filters.progress !== "all" &&
      taskProgress(attempts, task.id) !== filters.progress
    ) {
      return false;
    }
    if (!query) return true;

    return normalizeSearch(
      [
        task.id,
        task.statementPreview,
        task.source,
        topicLabels[task.topic] ?? task.topic,
      ].join(" "),
    ).includes(query);
  });

  return filtered.toSorted((a, b) => {
    if (filters.sort === "difficulty") {
      return (
        a.difficulty - b.difficulty ||
        a.slot - b.slot ||
        a.id.localeCompare(b.id)
      );
    }
    return a.slot - b.slot || a.id.localeCompare(b.id);
  });
}

export function taskProgress(
  attempts: readonly Attempt[],
  taskId: string,
): TaskProgress {
  const last = attempts.findLast((attempt) => attempt.taskId === taskId);
  if (!last) return "new";
  return last.correct ? "correct" : "incorrect";
}

export function activeFilterCount(filters: TaskBankFilters): number {
  return (
    filters.positions.length +
    filters.topics.length +
    filters.difficulties.length +
    Number(filters.progress !== "all")
  );
}

export function difficultyBand(level: number): DifficultyBand {
  if (level <= 2) return "foundation";
  if (level === 3) return "exam";
  return "advanced";
}

export function toURLSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

export function parsePracticeSet(
  value: string | undefined,
  validTaskIds: ReadonlySet<string>,
): string[] {
  return unique(
    (value ?? "").split(",").filter((taskId) => validTaskIds.has(taskId)),
  ).slice(0, MAX_PRACTICE_SET_SIZE);
}

export function safeTaskBankReturnPath(
  value: string | undefined,
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const base = new URL("https://do-indeksa.invalid");
    const target = new URL(value, base);
    const allowedPath =
      target.pathname === "/" ||
      target.pathname === "/cabinet" ||
      target.pathname === TASK_BANK_PATH ||
      target.pathname === "/prep" ||
      target.pathname === "/history";
    const validOverviewQuery =
      (target.pathname !== "/" && target.pathname !== "/cabinet") ||
      (!target.search && !target.hash);
    const validHistoryQuery =
      target.pathname !== "/history" ||
      (!target.hash &&
        [...target.searchParams.keys()].every((key) => key === "tab") &&
        (!target.searchParams.has("tab") ||
          target.searchParams.get("tab") === "tasks"));
    if (
      target.origin !== base.origin ||
      !allowedPath ||
      !validOverviewQuery ||
      (target.pathname === "/prep" && (target.search || target.hash)) ||
      !validHistoryQuery
    ) {
      return null;
    }
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
