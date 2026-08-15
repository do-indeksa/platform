import { validate as isUuid } from "uuid";
import { MAX_TASK_ANSWER_PARTS } from "./task-draft";
import {
  MAX_PRACTICE_RUN_TASKS,
  type PracticeCloudAssignment,
  type PracticeCloudCatalog,
  type PracticeCloudTask,
} from "./practice-cloud-types";

const BLUEPRINT_PATTERN = /^ftn-p1:\d{4}\.\d+$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
export const PRACTICE_CLIENT_CLOCK_SKEW_MS = 5 * 60_000;

export function parseActivePracticeRunIds(
  value: unknown,
  limit: number,
): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const active: { id: string; startedAt: number }[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      !isPracticeRecord(candidate) ||
      !isUuidString(candidate.id) ||
      seen.has(candidate.id) ||
      !isRunKind(candidate.kind) ||
      !isRunStatus(candidate.status) ||
      !isPracticeRemoteTime(candidate.startedAt)
    ) {
      return null;
    }
    seen.add(candidate.id);
    if (candidate.kind === "PRACTICE" && candidate.status === "ACTIVE") {
      active.push({
        id: candidate.id,
        startedAt: Date.parse(candidate.startedAt as string),
      });
    }
  }
  return active
    .toSorted(
      (left, right) =>
        right.startedAt - left.startedAt || left.id.localeCompare(right.id),
    )
    .map(({ id }) => id);
}

export function resolvePracticeCloudAssignment(
  value: unknown,
  catalog: PracticeCloudCatalog,
): PracticeCloudAssignment | null {
  const catalogTasks = parseCatalog(catalog);
  if (
    catalogTasks === null ||
    !isPracticeRecord(value) ||
    !isUuidString(value.id) ||
    value.blueprintVersion !== catalog.blueprintVersion ||
    typeof value.contentRevision !== "string" ||
    !REVISION_PATTERN.test(value.contentRevision) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > MAX_PRACTICE_RUN_TASKS
  ) {
    return null;
  }
  const taskById = new Map(catalogTasks.map((task) => [task.id, task]));
  const tasks: PracticeCloudTask[] = [];
  const seen = new Set<string>();
  for (const rawItem of value.items) {
    if (
      !isPracticeRecord(rawItem) ||
      typeof rawItem.taskId !== "string" ||
      seen.has(rawItem.taskId)
    ) {
      return null;
    }
    const task = taskById.get(rawItem.taskId);
    if (task === undefined) return null;
    seen.add(task.id);
    tasks.push(task);
  }
  return {
    runId: value.id,
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: value.contentRevision,
    tasks,
  };
}

export function isPracticeCloudAssignment(
  value: unknown,
): value is PracticeCloudAssignment {
  return parseAssignment(value) !== null;
}

export function parsePracticeAssignmentTasks(
  value: unknown,
): PracticeCloudTask[] | null {
  return parseAssignment(value);
}

export function isPracticeRemoteTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) &&
    timestamp > 0 &&
    timestamp <= Date.now() + PRACTICE_CLIENT_CLOCK_SKEW_MS
  );
}

export function isPracticeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isPracticeRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssignment(value: unknown): PracticeCloudTask[] | null {
  if (
    !isPracticeRecord(value) ||
    !isUuidString(value.runId) ||
    typeof value.blueprintVersion !== "string" ||
    !BLUEPRINT_PATTERN.test(value.blueprintVersion) ||
    typeof value.contentRevision !== "string" ||
    !REVISION_PATTERN.test(value.contentRevision) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1 ||
    value.tasks.length > MAX_PRACTICE_RUN_TASKS
  ) {
    return null;
  }
  const tasks: PracticeCloudTask[] = [];
  const taskIds = new Set<string>();
  for (const candidate of value.tasks) {
    const task = parseTask(candidate);
    if (task === null || taskIds.has(task.id)) return null;
    taskIds.add(task.id);
    tasks.push(task);
  }
  return tasks;
}

function parseCatalog(value: unknown): PracticeCloudTask[] | null {
  if (
    !isPracticeRecord(value) ||
    typeof value.blueprintVersion !== "string" ||
    !BLUEPRINT_PATTERN.test(value.blueprintVersion) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1
  ) {
    return null;
  }
  const tasks: PracticeCloudTask[] = [];
  const seen = new Map<string, PracticeCloudTask>();
  for (const candidate of value.tasks) {
    const parsed = parseTask(candidate);
    if (parsed === null) return null;
    const existing = seen.get(parsed.id);
    if (existing !== undefined) {
      if (!sameTask(existing, parsed)) return null;
      continue;
    }
    seen.set(parsed.id, parsed);
    tasks.push(parsed);
  }
  return tasks;
}

function parseTask(value: unknown): PracticeCloudTask | null {
  if (
    !isPracticeRecord(value) ||
    typeof value.id !== "string" ||
    !TASK_ID_PATTERN.test(value.id) ||
    typeof value.revision !== "string" ||
    !REVISION_PATTERN.test(value.revision) ||
    !isPracticeInteger(value.slot, 1, 10) ||
    typeof value.topic !== "string" ||
    !TASK_ID_PATTERN.test(value.topic) ||
    !isPracticeInteger(value.answerPartCount, 1, MAX_TASK_ANSWER_PARTS)
  ) {
    return null;
  }
  return {
    id: value.id,
    revision: value.revision,
    slot: value.slot,
    topic: value.topic,
    answerPartCount: value.answerPartCount,
  };
}

function sameTask(left: PracticeCloudTask, right: PracticeCloudTask): boolean {
  return (
    left.id === right.id &&
    left.revision === right.revision &&
    left.slot === right.slot &&
    left.topic === right.topic &&
    left.answerPartCount === right.answerPartCount
  );
}

function isRunKind(value: unknown): boolean {
  return (
    value === "PRACTICE" || value === "DIAGNOSTIC" || value === "SIMULATION"
  );
}

function isRunStatus(value: unknown): boolean {
  return value === "ACTIVE" || value === "SUBMITTED" || value === "ABANDONED";
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}
