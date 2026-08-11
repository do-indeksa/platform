import { validate as isUuid } from "uuid";
import type { Attempt } from "./knowledge";

export const ATTEMPT_STORAGE_VERSION = 2;
export const MAX_STORED_ATTEMPTS = 1_000;
export const MAX_ANSWER_LENGTH = 8_192;

const MAX_TASK_ID = 64;
const MAX_REVISION_LENGTH = 128;
const TASK_ID_PATTERN = /^[a-z0-9-]+$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const SOURCES = new Set(["diagnostic", "practice", "simulation"]);
const OUTCOMES = new Set([
  "CORRECT",
  "INCORRECT",
  "PARTIAL",
  "SKIPPED",
  "UNGRADED",
]);
const CLIENT_OUTCOMES = new Set(["CORRECT", "INCORRECT", "SKIPPED"]);

export type ClientAttemptOutcome = "CORRECT" | "INCORRECT" | "SKIPPED";

export type StandaloneAttemptInput = {
  id: string;
  standalone: {
    taskId: string;
    examPosition: number;
    taskRevision: string;
  };
  startedAt: string;
  submittedAt: string;
  activeDurationMs?: number;
  answer?: string;
  outcome: ClientAttemptOutcome;
  helpLevel: number;
  gradingKind: "AUTO";
};

export type LegacyStoredAttempt = Attempt & {
  transport?: undefined;
};

export type PendingLegacyAttempt = Attempt & {
  transport: "rest-legacy";
  ownerId: string | null;
};

export type RunFallbackAttempt = Attempt & {
  transport: "graphql";
  runId: string;
  ownerId: string | null;
};

export type PendingPracticeAttempt = Attempt & {
  transport: "graphql-standalone";
  ownerId: string | null;
  input: StandaloneAttemptInput;
};

export type StoredAttempt =
  | LegacyStoredAttempt
  | PendingLegacyAttempt
  | RunFallbackAttempt
  | PendingPracticeAttempt;

export type PracticeAttemptInput = {
  taskId: string;
  slot: number;
  taskRevision: string;
  startedAt: string;
  submittedAt: string;
  activeDurationMs?: number;
  answer?: string;
  outcome: ClientAttemptOutcome;
  helpLevel: number;
};

export type ServerAttempt = {
  id: string;
  attempt: Attempt;
};

export function createPendingPracticeAttempt(
  value: PracticeAttemptInput,
  ownerId: string | null,
): PendingPracticeAttempt | null {
  if (!isOwner(ownerId)) return null;
  const input: StandaloneAttemptInput = {
    id: crypto.randomUUID(),
    standalone: {
      taskId: value.taskId,
      examPosition: value.slot,
      taskRevision: value.taskRevision,
    },
    startedAt: value.startedAt,
    submittedAt: value.submittedAt,
    ...(value.activeDurationMs === undefined
      ? {}
      : { activeDurationMs: value.activeDurationMs }),
    ...(value.answer === undefined ? {} : { answer: value.answer }),
    outcome: value.outcome,
    helpLevel: value.helpLevel,
    gradingKind: "AUTO",
  };
  return parseStoredAttempt({
    taskId: value.taskId,
    slot: value.slot,
    correct: value.outcome === "CORRECT",
    source: "practice",
    helpLevel: value.helpLevel,
    at: value.submittedAt,
    transport: "graphql-standalone",
    ownerId,
    input,
  }) as PendingPracticeAttempt | null;
}

export function parseStoredAttempt(value: unknown): StoredAttempt | null {
  const attempt = parsePublicAttempt(value);
  if (attempt === null || !isRecord(value)) return null;
  const transport = value.transport;
  if (transport === undefined) {
    return value.runId === undefined &&
      value.ownerId === undefined &&
      value.input === undefined
      ? attempt
      : null;
  }

  const ownerId = parseOwner(value.ownerId);
  if (ownerId === undefined) return null;
  if (transport === "rest-legacy") {
    return value.runId === undefined && value.input === undefined
      ? { ...attempt, transport, ownerId }
      : null;
  }
  if (transport === "graphql") {
    return typeof value.runId === "string" &&
      isUuid(value.runId) &&
      value.input === undefined
      ? { ...attempt, transport, runId: value.runId, ownerId }
      : null;
  }
  if (transport !== "graphql-standalone" || value.runId !== undefined) {
    return null;
  }
  const input = parseStandaloneInput(value.input);
  if (
    input === null ||
    attempt.source !== "practice" ||
    attempt.taskId !== input.standalone.taskId ||
    attempt.slot !== input.standalone.examPosition ||
    attempt.at !== input.submittedAt ||
    attempt.correct !== (input.outcome === "CORRECT") ||
    attempt.helpLevel !== input.helpLevel
  ) {
    return null;
  }
  return { ...attempt, transport, ownerId, input };
}

export function isPublicAttempt(value: unknown): value is Attempt {
  return parsePublicAttempt(value) !== null;
}

export function toPublicAttempt(attempt: Attempt): Attempt {
  return {
    taskId: attempt.taskId,
    slot: attempt.slot,
    correct: attempt.correct,
    source: attempt.source,
    helpLevel: attempt.helpLevel,
    at: attempt.at,
  };
}

export function claimAttemptOwner(
  attempt: StoredAttempt,
  ownerId: string,
): StoredAttempt {
  if (attempt.transport === undefined) {
    return { ...attempt, transport: "rest-legacy", ownerId };
  }
  if (
    (attempt.transport === "rest-legacy" ||
      attempt.transport === "graphql" ||
      attempt.transport === "graphql-standalone") &&
    attempt.ownerId === null
  ) {
    return { ...attempt, ownerId };
  }
  return attempt;
}

export function isAttemptVisible(
  attempt: StoredAttempt,
  ownerId: string | null,
): boolean {
  if (attempt.transport === undefined) return true;
  return attempt.ownerId === ownerId;
}

export function parseAttemptJournalResponse(
  value: unknown,
  maxEntries: number,
): ServerAttempt[] | null {
  if (!isGraphQLSuccess(value) || !isRecord(value.data)) return null;
  const attempts = value.data.attempts;
  if (!Array.isArray(attempts) || attempts.length > maxEntries) return null;

  const result: ServerAttempt[] = [];
  const ids = new Set<string>();
  for (const candidate of attempts) {
    if (!isRecord(candidate)) return null;
    const id = candidate.id;
    const taskId = candidate.taskId;
    const position = candidate.examPosition;
    const mode = candidate.mode;
    const submittedAt = candidate.submittedAt;
    const outcome = candidate.outcome;
    const helpLevel = candidate.helpLevel;
    if (
      typeof id !== "string" ||
      !isUuid(id) ||
      ids.has(id) ||
      !isTaskId(taskId) ||
      !isPosition(position) ||
      typeof mode !== "string" ||
      !SOURCES.has(mode.toLowerCase()) ||
      !isTimestamp(submittedAt) ||
      typeof outcome !== "string" ||
      !OUTCOMES.has(outcome) ||
      !isHelpLevel(helpLevel)
    ) {
      return null;
    }
    ids.add(id);
    if (outcome !== "CORRECT" && outcome !== "INCORRECT") continue;
    result.push({
      id,
      attempt: {
        taskId,
        slot: position,
        correct: outcome === "CORRECT",
        source: mode.toLowerCase() as Attempt["source"],
        helpLevel,
        at: submittedAt,
      },
    });
  }
  return result;
}

export function parseRecordAttemptResponse(
  value: unknown,
  expectedId: string,
): boolean {
  if (!isGraphQLSuccess(value) || !isRecord(value.data)) return false;
  const attempt = value.data.recordAttempt;
  return isRecord(attempt) && attempt.id === expectedId;
}

function parsePublicAttempt(value: unknown): Attempt | null {
  if (!isRecord(value)) return null;
  const helpLevel = value.helpLevel ?? 0;
  return isTaskId(value.taskId) &&
    isPosition(value.slot) &&
    typeof value.correct === "boolean" &&
    typeof value.source === "string" &&
    SOURCES.has(value.source) &&
    isHelpLevel(helpLevel) &&
    isTimestamp(value.at)
    ? {
        taskId: value.taskId,
        slot: value.slot,
        correct: value.correct,
        source: value.source as Attempt["source"],
        helpLevel,
        at: value.at,
      }
    : null;
}

function parseStandaloneInput(value: unknown): StandaloneAttemptInput | null {
  if (!isRecord(value) || !isRecord(value.standalone)) return null;
  const activeDurationMs = value.activeDurationMs;
  const answer = value.answer;
  if (
    typeof value.id !== "string" ||
    !isUuid(value.id) ||
    !isTaskId(value.standalone.taskId) ||
    !isPosition(value.standalone.examPosition) ||
    typeof value.standalone.taskRevision !== "string" ||
    value.standalone.taskRevision.length > MAX_REVISION_LENGTH ||
    !REVISION_PATTERN.test(value.standalone.taskRevision) ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.submittedAt) ||
    Date.parse(value.submittedAt) < Date.parse(value.startedAt) ||
    (activeDurationMs !== undefined && !isDuration(activeDurationMs)) ||
    (answer !== undefined &&
      (typeof answer !== "string" || answer.length > MAX_ANSWER_LENGTH)) ||
    typeof value.outcome !== "string" ||
    !CLIENT_OUTCOMES.has(value.outcome) ||
    !isHelpLevel(value.helpLevel) ||
    value.gradingKind !== "AUTO"
  ) {
    return null;
  }
  return {
    id: value.id,
    standalone: {
      taskId: value.standalone.taskId,
      examPosition: value.standalone.examPosition,
      taskRevision: value.standalone.taskRevision,
    },
    startedAt: value.startedAt,
    submittedAt: value.submittedAt,
    ...(activeDurationMs === undefined ? {} : { activeDurationMs }),
    ...(answer === undefined ? {} : { answer }),
    outcome: value.outcome as ClientAttemptOutcome,
    helpLevel: value.helpLevel,
    gradingKind: "AUTO",
  };
}

function parseOwner(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function isOwner(value: string | null): boolean {
  return value === null || isUuid(value);
}

function isGraphQLSuccess(
  value: unknown,
): value is { data: unknown; errors?: unknown[] } {
  return (
    isRecord(value) &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.length === 0))
  );
}

function isTaskId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TASK_ID &&
    TASK_ID_PATTERN.test(value)
  );
}

function isPosition(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

function isHelpLevel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    RFC3339_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
