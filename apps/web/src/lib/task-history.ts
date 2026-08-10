import { MAX_ANSWER_LENGTH } from "./task-draft";
import { SIMULATION_MAX_ANSWER_PARTS } from "./simulation-types";

export const TASK_HISTORY_STORAGE_KEY = "do-indeksa-task-history";
export const TASK_HISTORY_VERSION = 1;
export const TASK_HISTORY_LIMIT = 200;
export const ERROR_PRACTICE_LIMIT = 6;

export type TaskHistorySource = "practice" | "diagnostic" | "simulation";
export type TaskHistoryOutcome = "correct" | "incorrect" | "skipped";

export type TaskHistoryEntry = {
  id: string;
  taskId: string;
  slot: number;
  source: TaskHistorySource;
  outcome: TaskHistoryOutcome;
  answers: string[];
  helpLevel: number;
  at: string;
};

export type NewTaskHistoryEntry = Omit<TaskHistoryEntry, "id" | "at"> & {
  at?: string;
};

export type PersistedTaskHistory = {
  version: typeof TASK_HISTORY_VERSION;
  entries: TaskHistoryEntry[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^[a-z0-9-]+$/;
const SOURCES = new Set<TaskHistorySource>([
  "practice",
  "diagnostic",
  "simulation",
]);
const OUTCOMES = new Set<TaskHistoryOutcome>([
  "correct",
  "incorrect",
  "skipped",
]);

export function parseTaskHistory(value: unknown): TaskHistoryEntry[] {
  if (
    !isRecord(value) ||
    value.version !== TASK_HISTORY_VERSION ||
    !Array.isArray(value.entries)
  ) {
    return [];
  }

  const ids = new Set<string>();
  const entries: TaskHistoryEntry[] = [];
  for (const candidate of value.entries) {
    if (!isTaskHistoryEntry(candidate) || ids.has(candidate.id)) continue;
    ids.add(candidate.id);
    entries.push(cloneTaskHistoryEntry(candidate));
    if (entries.length === TASK_HISTORY_LIMIT) break;
  }
  return entries;
}

export function toPersistedTaskHistory(
  entries: readonly TaskHistoryEntry[],
): PersistedTaskHistory {
  return {
    version: TASK_HISTORY_VERSION,
    entries: entries.slice(0, TASK_HISTORY_LIMIT).map(cloneTaskHistoryEntry),
  };
}

export function isTaskHistoryEntry(value: unknown): value is TaskHistoryEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.taskId === "string" &&
    value.taskId.length >= 1 &&
    value.taskId.length <= 64 &&
    TASK_ID_PATTERN.test(value.taskId) &&
    Number.isInteger(value.slot) &&
    (value.slot as number) >= 1 &&
    (value.slot as number) <= 10 &&
    typeof value.source === "string" &&
    SOURCES.has(value.source as TaskHistorySource) &&
    typeof value.outcome === "string" &&
    OUTCOMES.has(value.outcome as TaskHistoryOutcome) &&
    Array.isArray(value.answers) &&
    value.answers.length >= 1 &&
    value.answers.length <= SIMULATION_MAX_ANSWER_PARTS &&
    value.answers.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    ) &&
    Number.isInteger(value.helpLevel) &&
    (value.helpLevel as number) >= 0 &&
    (value.helpLevel as number) <= 3 &&
    isTimestamp(value.at)
  );
}

export function isTaskHistoryId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function recentErrorTaskIds(
  entries: readonly TaskHistoryEntry[],
  limit = ERROR_PRACTICE_LIMIT,
): string[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const seen = new Set<string>();
  const taskIds: string[] = [];
  for (const entry of entries) {
    if (entry.outcome !== "incorrect" || seen.has(entry.taskId)) continue;
    seen.add(entry.taskId);
    taskIds.push(entry.taskId);
    if (taskIds.length === limit) break;
  }
  return taskIds;
}

function cloneTaskHistoryEntry(entry: TaskHistoryEntry): TaskHistoryEntry {
  return { ...entry, answers: [...entry.answers] };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
