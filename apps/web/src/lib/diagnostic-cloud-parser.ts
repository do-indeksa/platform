import { validate as isUuid } from "uuid";
import type { PersistedDiagnosticState } from "./diagnostic-store";
import { progressAttemptId, progressRunItemId } from "./progress-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import type {
  DiagnosticCloudCatalog,
  DiagnosticCloudTask,
} from "./diagnostic-cloud-types";

const CONTENT_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CLIENT_CLOCK_SKEW_MS = 5 * 60_000;

export type DiagnosticCloudRun = {
  runtime: PersistedDiagnosticState;
  blueprintVersion: string;
  contentRevision: string;
  checkpointUpdatedAt: string | null;
};

export function parseActiveDiagnosticRunIds(
  value: unknown,
  limit: number,
): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const activeIds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isUuidString(candidate.id) ||
      seen.has(candidate.id) ||
      !isRunKind(candidate.kind) ||
      !isRunStatus(candidate.status) ||
      !isRemoteTime(candidate.startedAt)
    ) {
      return null;
    }
    seen.add(candidate.id);
    if (candidate.kind === "DIAGNOSTIC" && candidate.status === "ACTIVE") {
      activeIds.push(candidate.id);
    }
  }
  return activeIds;
}

export function parseDiagnosticCloudRun(
  value: unknown,
  catalog: DiagnosticCloudCatalog,
  ownerId: string,
): DiagnosticCloudRun | null {
  if (
    !isRecord(value) ||
    !isUuid(ownerId) ||
    !isUuidString(value.id) ||
    value.kind !== "DIAGNOSTIC" ||
    value.status !== "ACTIVE" ||
    value.blueprintVersion !== catalog.blueprintVersion ||
    typeof value.contentRevision !== "string" ||
    !CONTENT_REVISION_PATTERN.test(value.contentRevision) ||
    !isRemoteTime(value.startedAt) ||
    !Array.isArray(value.items) ||
    value.items.length !== catalog.positions.length ||
    catalog.positions.length === 0
  ) {
    return null;
  }

  const runStartedAt = Date.parse(value.startedAt);
  const taskIds: string[] = [];
  const slots: number[] = [];
  const answers: string[][] = [];
  const outcomes: PersistedDiagnosticState["outcomes"] = [];
  const completedAt: PersistedDiagnosticState["completedAt"] = [];
  const runItemIds: string[] = [];
  const resolvedTasks: DiagnosticCloudTask[] = [];
  const seenTasks = new Set<string>();
  let completedCount = 0;
  let previousSubmittedAt = runStartedAt;

  for (const [index, rawItem] of value.items.entries()) {
    const position = catalog.positions[index];
    if (
      position?.ordinal !== index + 1 ||
      !isRecord(rawItem) ||
      rawItem.ordinal !== index + 1 ||
      rawItem.examPosition !== position.examPosition ||
      typeof rawItem.taskId !== "string"
    ) {
      return null;
    }
    const task = position.candidates.find(
      (candidate) => candidate.id === rawItem.taskId,
    );
    const expectedItemId = task ? progressRunItemId(value.id, task.id) : null;
    if (
      task === undefined ||
      seenTasks.has(task.id) ||
      rawItem.id !== expectedItemId ||
      rawItem.topic !== task.topic ||
      rawItem.taskRevision !== task.revision ||
      !Array.isArray(rawItem.recentAttempts) ||
      rawItem.recentAttempts.length > 1
    ) {
      return null;
    }
    seenTasks.add(task.id);
    taskIds.push(task.id);
    slots.push(task.slot);
    runItemIds.push(expectedItemId as string);
    resolvedTasks.push(task);

    const rawAttempt = rawItem.recentAttempts[0];
    if (rawAttempt === undefined) {
      outcomes.push(null);
      completedAt.push(null);
      answers.push(emptyAnswers(task));
      continue;
    }
    if (completedCount !== index) return null;
    const attempt = parseAttempt(
      rawAttempt,
      expectedItemId as string,
      task,
      position.examPosition,
      runStartedAt,
      previousSubmittedAt,
    );
    if (attempt === null) return null;
    completedCount += 1;
    previousSubmittedAt = attempt.completedAt;
    outcomes.push(attempt.outcome);
    completedAt.push(attempt.completedAt);
    answers.push(attempt.answers);
  }

  if (completedCount === value.items.length) {
    const lastIndex = completedCount - 1;
    const checkpoint = parseCompletedCheckpoint(
      value.checkpoint,
      runItemIds,
      resolvedTasks,
    );
    if (checkpoint === null) return null;
    return cloudRunResult(
      value,
      ownerId,
      checkpoint,
      taskIds,
      slots,
      answers,
      outcomes,
      completedAt,
      "done",
      lastIndex,
      runStartedAt,
    );
  }
  const checkpoint = parseCheckpoint(
    value.checkpoint,
    completedCount,
    runItemIds[completedCount],
    resolvedTasks[completedCount],
  );
  if (checkpoint === null) return null;
  if (checkpoint.answers !== null) {
    answers[completedCount] = checkpoint.answers;
  }

  return cloudRunResult(
    value,
    ownerId,
    checkpoint,
    taskIds,
    slots,
    answers,
    outcomes,
    completedAt,
    "running",
    completedCount,
    runStartedAt,
  );
}

function cloudRunResult(
  value: Record<string, unknown>,
  ownerId: string,
  checkpoint: { version: number; updatedAt: string | null },
  taskIds: string[],
  slots: number[],
  answers: string[][],
  outcomes: PersistedDiagnosticState["outcomes"],
  completedAt: PersistedDiagnosticState["completedAt"],
  phase: "running" | "done",
  currentIndex: number,
  startedAt: number,
): DiagnosticCloudRun {
  return {
    runtime: {
      runId: value.id as string,
      runOwnerId: ownerId,
      checkpointVersion: checkpoint.version,
      taskIds,
      slots,
      answers,
      outcomes,
      completedAt,
      phase,
      currentIndex,
      startedAt,
    },
    blueprintVersion: value.blueprintVersion as string,
    contentRevision: value.contentRevision as string,
    checkpointUpdatedAt: checkpoint.updatedAt,
  };
}

function parseCompletedCheckpoint(
  value: unknown,
  runItemIds: string[],
  tasks: DiagnosticCloudTask[],
): { version: number; updatedAt: string | null } | null {
  if (value === null || value === undefined) {
    return { version: 0, updatedAt: null };
  }
  if (
    !isRecord(value) ||
    !isPositiveVersion(value.version) ||
    !Number.isInteger(value.currentOrdinal) ||
    (value.currentOrdinal as number) < 1 ||
    (value.currentOrdinal as number) > runItemIds.length ||
    !isOptionalDuration(value.activeDurationMs) ||
    !isRemoteTime(value.updatedAt) ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > 1
  ) {
    return null;
  }
  const draft = value.drafts[0];
  if (draft !== undefined) {
    const index = (value.currentOrdinal as number) - 1;
    if (
      !isRecord(draft) ||
      draft.runItemId !== runItemIds[index] ||
      parseAnswers(draft.answer, tasks[index].answerPartCount) === null
    ) {
      return null;
    }
  }
  return { version: value.version, updatedAt: value.updatedAt };
}

function parseAttempt(
  value: unknown,
  runItemId: string,
  task: DiagnosticCloudTask,
  examPosition: number,
  runStartedAt: number,
  previousSubmittedAt: number,
): {
  outcome: "correct" | "incorrect" | "skipped";
  answers: string[];
  completedAt: number;
} | null {
  if (
    !isRecord(value) ||
    value.id !== progressAttemptId(runItemId) ||
    value.runItemId !== runItemId ||
    value.taskId !== task.id ||
    value.examPosition !== examPosition ||
    value.mode !== "DIAGNOSTIC" ||
    value.helpLevel !== 0 ||
    value.gradingKind !== "AUTO" ||
    value.taskRevision !== task.revision ||
    !isRemoteTime(value.startedAt) ||
    !isRemoteTime(value.submittedAt)
  ) {
    return null;
  }
  const startedAt = Date.parse(value.startedAt);
  const submittedAt = Date.parse(value.submittedAt);
  if (
    startedAt < runStartedAt ||
    startedAt < previousSubmittedAt ||
    submittedAt < startedAt
  ) {
    return null;
  }
  if (value.outcome === "SKIPPED") {
    if (value.answer !== null && value.answer !== undefined) return null;
    return {
      outcome: "skipped",
      answers: emptyAnswers(task),
      completedAt: submittedAt,
    };
  }
  if (value.outcome !== "CORRECT" && value.outcome !== "INCORRECT") {
    return null;
  }
  const parsedAnswers = parseAnswers(value.answer, task.answerPartCount);
  if (parsedAnswers === null) return null;
  return {
    outcome: value.outcome === "CORRECT" ? "correct" : "incorrect",
    answers: parsedAnswers,
    completedAt: submittedAt,
  };
}

function parseCheckpoint(
  value: unknown,
  completedCount: number,
  currentRunItemId: string,
  task: DiagnosticCloudTask,
): {
  version: number;
  answers: string[] | null;
  updatedAt: string | null;
} | null {
  if (value === null || value === undefined) {
    return { version: 0, answers: null, updatedAt: null };
  }
  if (
    !isRecord(value) ||
    !isPositiveVersion(value.version) ||
    value.currentOrdinal !== completedCount + 1 ||
    !isOptionalDuration(value.activeDurationMs) ||
    !isRemoteTime(value.updatedAt) ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > 1
  ) {
    return null;
  }
  const draft = value.drafts[0];
  if (draft === undefined) {
    return {
      version: value.version,
      answers: null,
      updatedAt: value.updatedAt,
    };
  }
  if (!isRecord(draft) || draft.runItemId !== currentRunItemId) return null;
  const parsedAnswers = parseAnswers(draft.answer, task.answerPartCount);
  return parsedAnswers === null
    ? null
    : {
        version: value.version,
        answers: parsedAnswers,
        updatedAt: value.updatedAt,
      };
}

function parseAnswers(value: unknown, partCount: number): string[] | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  try {
    const answers: unknown = JSON.parse(value);
    if (
      !Array.isArray(answers) ||
      answers.length !== partCount ||
      !answers.every(
        (answer) =>
          typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
      )
    ) {
      return null;
    }
    return [...answers];
  } catch {
    return null;
  }
}

function emptyAnswers(task: DiagnosticCloudTask): string[] {
  return Array<string>(task.answerPartCount).fill("");
}

function isRemoteTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) &&
    timestamp > 0 &&
    timestamp <= Date.now() + CLIENT_CLOCK_SKEW_MS
  );
}

function isPositiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isOptionalDuration(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

function isRunKind(value: unknown): boolean {
  return (
    value === "PRACTICE" || value === "DIAGNOSTIC" || value === "SIMULATION"
  );
}

function isRunStatus(value: unknown): boolean {
  return value === "ACTIVE" || value === "SUBMITTED" || value === "ABANDONED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
