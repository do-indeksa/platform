import { MAX_ANSWER_LENGTH } from "./task-draft";
import { SIMULATION_MAX_ANSWER_PARTS } from "./simulation-types";

export const TASK_HISTORY_STORAGE_KEY = "do-indeksa-task-history";
export const TASK_HISTORY_VERSION = 2;
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

export type StoredTaskHistoryEntry = TaskHistoryEntry & {
  ownerId: string | null;
};

export type PersistedTaskHistory = {
  version: typeof TASK_HISTORY_VERSION;
  entries: StoredTaskHistoryEntry[];
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

export function parseTaskHistory(value: unknown): StoredTaskHistoryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return [];
  }

  const legacy = value.version === 1;
  if (!legacy && value.version !== TASK_HISTORY_VERSION) return [];

  const ids = new Set<string>();
  const entries: StoredTaskHistoryEntry[] = [];
  for (const candidate of value.entries) {
    const entry = legacy
      ? toLegacyStoredEntry(candidate)
      : toStoredTaskHistoryEntry(candidate);
    if (entry === null || ids.has(entry.id)) continue;
    ids.add(entry.id);
    entries.push(entry);
    if (entries.length === TASK_HISTORY_LIMIT) break;
  }
  return entries;
}

export function toPersistedTaskHistory(
  entries: readonly StoredTaskHistoryEntry[],
): PersistedTaskHistory {
  return {
    version: TASK_HISTORY_VERSION,
    entries: entries.slice(0, TASK_HISTORY_LIMIT).map(cloneStoredEntry),
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
  return {
    id: entry.id,
    taskId: entry.taskId,
    slot: entry.slot,
    source: entry.source,
    outcome: entry.outcome,
    answers: [...entry.answers],
    helpLevel: entry.helpLevel,
    at: entry.at,
  };
}

export function toPublicTaskHistoryEntry(
  entry: StoredTaskHistoryEntry,
): TaskHistoryEntry {
  return cloneTaskHistoryEntry(entry);
}

function toLegacyStoredEntry(value: unknown): StoredTaskHistoryEntry | null {
  if (!isTaskHistoryEntry(value)) return null;
  return { ...cloneTaskHistoryEntry(value), ownerId: null };
}

function toStoredTaskHistoryEntry(
  value: unknown,
): StoredTaskHistoryEntry | null {
  if (!isRecord(value)) return null;
  const ownerId = value.ownerId;
  if (!isTaskHistoryEntry(value) || !isOwnerId(ownerId)) return null;
  return cloneStoredEntry({ ...value, ownerId });
}

function cloneStoredEntry(
  entry: StoredTaskHistoryEntry,
): StoredTaskHistoryEntry {
  return { ...cloneTaskHistoryEntry(entry), ownerId: entry.ownerId };
}

function isOwnerId(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && UUID_PATTERN.test(value))
  );
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
