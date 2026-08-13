import { validate as isUuid, v5 as uuidV5 } from "uuid";
import {
  FTN_P1_SIMULATION_DURATION_MS,
  isCompleteFtnP1SimulationItems,
  isFtnP1SimulationBlueprintVersion,
  isSimulationTaskRevision,
} from "./simulation-run";

const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_BLUEPRINT_LENGTH = 64;
const MAX_REVISION_LENGTH = 128;
const MAX_RUN_ITEMS = 100;
const MAX_ANSWER_CHARACTERS = 8_192;
const CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ProgressRunKind = "PRACTICE" | "DIAGNOSTIC" | "SIMULATION";
export type ProgressAttemptOutcome =
  "CORRECT" | "INCORRECT" | "PARTIAL" | "SKIPPED" | "UNGRADED";
export type ProgressGradingKind = "AUTO" | "RUBRIC_SELF";

export type CompletedProgressAttempt = {
  id: string;
  startedAt: string;
  submittedAt: string;
  activeDurationMs?: number;
  answer?: string;
  outcome: ProgressAttemptOutcome;
  helpLevel: number;
  gradingKind: ProgressGradingKind;
  earnedPoints?: number;
};

export type CompletedProgressItem = {
  id: string;
  taskId: string;
  examPosition: number;
  topic: string;
  maxPoints?: number;
  taskRevision: string;
  attempt: CompletedProgressAttempt;
};

export type CompletedProgressRun = {
  id: string;
  kind: ProgressRunKind;
  blueprintVersion: string;
  contentRevision: string;
  startedAt: string;
  deadlineAt?: string;
  submittedAt: string;
  activeDurationMs?: number;
  items: CompletedProgressItem[];
};

export function progressRunItemId(runId: string, taskId: string): string {
  if (!isUuid(runId) || !TASK_ID_PATTERN.test(taskId)) {
    throw new TypeError("run and task IDs must be valid");
  }
  return uuidV5(`run-item:${taskId}`, runId);
}

export function progressAttemptId(runItemId: string): string {
  if (!isUuid(runItemId)) throw new TypeError("run item ID must be valid");
  return uuidV5("attempt:1", runItemId);
}

export function progressRubricAttemptId(runItemId: string): string {
  if (!isUuid(runItemId)) throw new TypeError("run item ID must be valid");
  return uuidV5("attempt:rubric-self:1", runItemId);
}

export function parseCompletedProgressRun(
  value: unknown,
): CompletedProgressRun | null {
  if (!isRecord(value) || !isUuidString(value.id)) return null;
  if (
    !isRunKind(value.kind) ||
    !isBoundedString(value.blueprintVersion, MAX_BLUEPRINT_LENGTH) ||
    !isBoundedString(value.contentRevision, MAX_REVISION_LENGTH) ||
    !isIsoTime(value.startedAt) ||
    (value.deadlineAt !== undefined && !isIsoTime(value.deadlineAt)) ||
    !isIsoTime(value.submittedAt) ||
    (value.deadlineAt !== undefined &&
      Date.parse(value.deadlineAt) < Date.parse(value.startedAt)) ||
    Date.parse(value.submittedAt) < Date.parse(value.startedAt) ||
    !isOptionalDuration(
      value.activeDurationMs,
      Date.parse(value.submittedAt) - Date.parse(value.startedAt),
    ) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > MAX_RUN_ITEMS
  ) {
    return null;
  }

  const items: CompletedProgressItem[] = [];
  const itemIds = new Set<string>();
  const taskIds = new Set<string>();
  const positions = new Set<number>();
  for (const candidate of value.items) {
    const item = parseItem(
      candidate,
      value.id,
      value.startedAt,
      value.submittedAt,
    );
    if (
      item === null ||
      itemIds.has(item.id) ||
      taskIds.has(item.taskId) ||
      (value.kind === "SIMULATION" && positions.has(item.examPosition))
    ) {
      return null;
    }
    itemIds.add(item.id);
    taskIds.add(item.taskId);
    positions.add(item.examPosition);
    items.push(item);
  }
  let deadlineAt = value.deadlineAt;
  if (value.kind === "SIMULATION") {
    const expectedDeadlineAt = new Date(
      Date.parse(value.startedAt) + FTN_P1_SIMULATION_DURATION_MS,
    ).toISOString();
    if (
      !isFtnP1SimulationBlueprintVersion(value.blueprintVersion) ||
      !isSimulationTaskRevision(value.contentRevision) ||
      !isCompleteFtnP1SimulationItems(items) ||
      items.some((item) => !isSimulationTaskRevision(item.taskRevision)) ||
      (value.activeDurationMs !== undefined &&
        value.activeDurationMs > FTN_P1_SIMULATION_DURATION_MS) ||
      (deadlineAt !== undefined && deadlineAt !== expectedDeadlineAt)
    ) {
      return null;
    }
    deadlineAt = expectedDeadlineAt;
  }

  return {
    id: value.id,
    kind: value.kind,
    blueprintVersion: value.blueprintVersion,
    contentRevision: value.contentRevision,
    startedAt: value.startedAt,
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
    submittedAt: value.submittedAt,
    ...(value.activeDurationMs === undefined
      ? {}
      : { activeDurationMs: value.activeDurationMs }),
    items,
  };
}

function parseItem(
  value: unknown,
  runId: string,
  runStartedAt: string,
  runSubmittedAt: string,
): CompletedProgressItem | null {
  if (
    !isRecord(value) ||
    !isUuidString(value.id) ||
    !isTaskId(value.taskId) ||
    !isInteger(value.examPosition, 1, 10) ||
    !isTaskId(value.topic) ||
    !isOptionalInteger(value.maxPoints, 1, 60) ||
    !isBoundedString(value.taskRevision, MAX_REVISION_LENGTH) ||
    value.id !== progressRunItemId(runId, value.taskId)
  ) {
    return null;
  }
  const attempt = parseAttempt(
    value.attempt,
    value.maxPoints,
    runStartedAt,
    runSubmittedAt,
  );
  const expectedAttemptId =
    attempt?.gradingKind === "RUBRIC_SELF"
      ? progressRubricAttemptId(value.id)
      : progressAttemptId(value.id);
  if (attempt === null || attempt.id !== expectedAttemptId) {
    return null;
  }
  return {
    id: value.id,
    taskId: value.taskId,
    examPosition: value.examPosition,
    topic: value.topic,
    ...(value.maxPoints === undefined ? {} : { maxPoints: value.maxPoints }),
    taskRevision: value.taskRevision,
    attempt,
  };
}

function parseAttempt(
  value: unknown,
  maxPoints: unknown,
  runStartedAt: string,
  runSubmittedAt: string,
): CompletedProgressAttempt | null {
  if (
    !isRecord(value) ||
    !isUuidString(value.id) ||
    !isIsoTime(value.startedAt) ||
    !isIsoTime(value.submittedAt) ||
    Date.parse(value.startedAt) < Date.parse(runStartedAt) ||
    Date.parse(value.submittedAt) < Date.parse(value.startedAt) ||
    Date.parse(value.submittedAt) > Date.parse(runSubmittedAt) ||
    !isOptionalDuration(
      value.activeDurationMs,
      Date.parse(value.submittedAt) - Date.parse(value.startedAt),
    ) ||
    (value.answer !== undefined && !isAnswer(value.answer)) ||
    !isOutcome(value.outcome) ||
    !isInteger(value.helpLevel, 0, 3) ||
    (value.gradingKind !== "AUTO" && value.gradingKind !== "RUBRIC_SELF") ||
    !isOptionalInteger(value.earnedPoints, 0, 60) ||
    !isValidScore(value.outcome, value.earnedPoints, maxPoints)
  ) {
    return null;
  }
  return {
    id: value.id,
    startedAt: value.startedAt,
    submittedAt: value.submittedAt,
    ...(value.activeDurationMs === undefined
      ? {}
      : { activeDurationMs: value.activeDurationMs }),
    ...(value.answer === undefined ? {} : { answer: value.answer }),
    outcome: value.outcome,
    helpLevel: value.helpLevel,
    gradingKind: value.gradingKind,
    ...(value.earnedPoints === undefined
      ? {}
      : { earnedPoints: value.earnedPoints }),
  };
}

function isValidScore(
  outcome: ProgressAttemptOutcome,
  earnedPoints: unknown,
  maxPoints: unknown,
): boolean {
  if (earnedPoints !== undefined) {
    if (
      maxPoints === undefined ||
      (earnedPoints as number) > (maxPoints as number)
    ) {
      return false;
    }
  }
  if (outcome === "CORRECT") {
    return earnedPoints === undefined || earnedPoints === maxPoints;
  }
  if (outcome === "INCORRECT") {
    return earnedPoints === undefined || earnedPoints === 0;
  }
  if (outcome === "PARTIAL") {
    return (
      typeof earnedPoints === "number" &&
      typeof maxPoints === "number" &&
      earnedPoints > 0 &&
      earnedPoints < maxPoints
    );
  }
  return earnedPoints === undefined;
}

function isRunKind(value: unknown): value is ProgressRunKind {
  return (
    value === "PRACTICE" || value === "DIAGNOSTIC" || value === "SIMULATION"
  );
}

function isOutcome(value: unknown): value is ProgressAttemptOutcome {
  return (
    value === "CORRECT" ||
    value === "INCORRECT" ||
    value === "PARTIAL" ||
    value === "SKIPPED" ||
    value === "UNGRADED"
  );
}

function isTaskId(value: unknown): value is string {
  return typeof value === "string" && TASK_ID_PATTERN.test(value);
}

function isAnswer(value: unknown): value is string {
  return (
    typeof value === "string" && [...value].length <= MAX_ANSWER_CHARACTERS
  );
}

function isIsoTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isOptionalDuration(
  value: unknown,
  elapsedMs: number,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= elapsedMs + CLIENT_CLOCK_SKEW_MS)
  );
}

function isOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | undefined {
  return value === undefined || isInteger(value, minimum, maximum);
}

function isInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
