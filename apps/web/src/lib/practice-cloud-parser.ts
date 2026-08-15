import { validate as isUuid } from "uuid";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  PRACTICE_CLIENT_CLOCK_SKEW_MS,
  isPracticeInteger,
  isPracticeRecord,
  isPracticeRemoteTime,
  parsePracticeAssignmentTasks,
} from "./practice-cloud-contract";
export {
  isPracticeCloudAssignment,
  parseActivePracticeRunIds,
  resolvePracticeCloudAssignment,
} from "./practice-cloud-contract";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAssignment,
  type PracticeCloudAttempt,
  type PracticeCloudDraft,
  type PracticeCloudItem,
  type PracticeCloudRun,
  type PracticeCloudTask,
} from "./practice-cloud-types";

export function parsePracticeCloudRun(
  value: unknown,
  assignment: PracticeCloudAssignment,
  ownerId: string,
): PracticeCloudRun | null {
  const tasks = parsePracticeAssignmentTasks(assignment);
  if (
    tasks === null ||
    !isUuid(ownerId) ||
    !isPracticeRecord(value) ||
    value.id !== assignment.runId ||
    value.kind !== "PRACTICE" ||
    value.status !== "ACTIVE" ||
    value.blueprintVersion !== assignment.blueprintVersion ||
    value.contentRevision !== assignment.contentRevision ||
    !isPracticeRemoteTime(value.startedAt) ||
    !Array.isArray(value.items) ||
    value.items.length !== tasks.length
  ) {
    return null;
  }

  const startedAt = Date.parse(value.startedAt as string);
  const parsedItems: PracticeCloudItem[] = [];
  const allAttempts: PracticeCloudAttempt[] = [];
  const attemptIds = new Set<string>();
  for (const [index, rawItem] of value.items.entries()) {
    const task = tasks[index];
    const item = parseItem(rawItem, assignment.runId, task, index, startedAt);
    if (item === null) return null;
    for (const attempt of item.attempts) {
      if (attemptIds.has(attempt.id)) return null;
      attemptIds.add(attempt.id);
      allAttempts.push(attempt);
    }
    parsedItems.push(item);
  }
  if (!hasGlobalCausalOrder(allAttempts, startedAt)) return null;

  const checkpoint = parseCheckpoint(value.checkpoint, parsedItems, startedAt);
  if (checkpoint === null) return null;
  for (const [index, draft] of checkpoint.drafts) {
    parsedItems[index] = { ...parsedItems[index], draft };
  }

  return {
    runId: assignment.runId,
    runOwnerId: ownerId,
    blueprintVersion: assignment.blueprintVersion,
    contentRevision: assignment.contentRevision,
    startedAt,
    checkpointVersion: checkpoint.version,
    currentIndex: checkpoint.currentIndex,
    activeDurationMs: checkpoint.activeDurationMs,
    checkpointUpdatedAt: checkpoint.updatedAt,
    items: parsedItems,
  };
}

function parseItem(
  value: unknown,
  runId: string,
  task: PracticeCloudTask,
  index: number,
  runStartedAt: number,
): PracticeCloudItem | null {
  const runItemId = progressRunItemId(runId, task.id);
  if (
    !isPracticeRecord(value) ||
    value.id !== runItemId ||
    value.taskId !== task.id ||
    value.ordinal !== index + 1 ||
    value.examPosition !== task.slot ||
    value.topic !== task.topic ||
    value.answerPartCount !== task.answerPartCount ||
    value.taskRevision !== task.revision ||
    !Array.isArray(value.recentAttempts) ||
    value.recentAttempts.length > MAX_PRACTICE_ATTEMPTS_PER_TASK
  ) {
    return null;
  }

  const attempts: PracticeCloudAttempt[] = [];
  let previousSubmittedAt = runStartedAt;
  let previousHelpLevel = 0;
  for (const [attemptIndex, rawAttempt] of value.recentAttempts.entries()) {
    const attempt = parseAttempt(
      rawAttempt,
      task,
      runItemId,
      attemptIndex + 1,
      runStartedAt,
    );
    if (
      attempt === null ||
      attempt.startedAt < previousSubmittedAt ||
      (attemptIndex > 0 && attempt.helpLevel < previousHelpLevel) ||
      (attemptIndex < value.recentAttempts.length - 1 &&
        isTerminal(attempt.outcome))
    ) {
      return null;
    }
    attempts.push(attempt);
    previousSubmittedAt = attempt.submittedAt;
    previousHelpLevel = attempt.helpLevel;
  }

  return { runItemId, task, attempts, draft: null };
}

function parseAttempt(
  value: unknown,
  task: PracticeCloudTask,
  runItemId: string,
  attemptNumber: number,
  runStartedAt: number,
): PracticeCloudAttempt | null {
  if (
    !isPracticeRecord(value) ||
    value.id !== progressPracticeAttemptId(runItemId, attemptNumber) ||
    value.runItemId !== runItemId ||
    value.taskId !== task.id ||
    value.examPosition !== task.slot ||
    value.mode !== "PRACTICE" ||
    value.gradingKind !== "AUTO" ||
    value.taskRevision !== task.revision ||
    !isPracticeRemoteTime(value.startedAt) ||
    !isPracticeRemoteTime(value.submittedAt) ||
    !isPracticeInteger(value.helpLevel, 0, 3)
  ) {
    return null;
  }
  const startedAt = Date.parse(value.startedAt as string);
  const submittedAt = Date.parse(value.submittedAt as string);
  const activeDurationMs = parseActiveDuration(
    value.activeDurationMs,
    submittedAt - startedAt,
  );
  const answers = parseAnswers(value.answer, task.answerPartCount);
  const outcome = parseOutcome(value.outcome);
  if (
    startedAt < runStartedAt ||
    submittedAt < startedAt ||
    activeDurationMs === undefined ||
    answers === null ||
    outcome === null
  ) {
    return null;
  }
  return {
    id: value.id as string,
    number: attemptNumber,
    startedAt,
    submittedAt,
    activeDurationMs,
    answers,
    outcome,
    helpLevel: value.helpLevel as number,
  };
}

function parseCheckpoint(
  value: unknown,
  items: readonly PracticeCloudItem[],
  runStartedAt: number,
): {
  version: number;
  currentIndex: number;
  activeDurationMs: number | null;
  updatedAt: string | null;
  drafts: Map<number, PracticeCloudDraft>;
} | null {
  if (value === null || value === undefined) {
    return {
      version: 0,
      currentIndex: firstUnfinishedIndex(items),
      activeDurationMs: null,
      updatedAt: null,
      drafts: new Map(),
    };
  }
  if (
    !isPracticeRecord(value) ||
    !isPracticeInteger(value.version, 1, Number.MAX_SAFE_INTEGER) ||
    !isPracticeInteger(value.currentOrdinal, 1, items.length) ||
    !isPracticeRemoteTime(value.updatedAt) ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > items.length
  ) {
    return null;
  }
  const updatedAt = Date.parse(value.updatedAt as string);
  if (updatedAt < runStartedAt - PRACTICE_CLIENT_CLOCK_SKEW_MS) return null;
  const elapsedMs = updatedAt - runStartedAt;
  const activeDurationMs = parseActiveDuration(
    value.activeDurationMs,
    elapsedMs,
  );
  if (activeDurationMs === undefined) return null;

  const itemIndexById = new Map(
    items.map((item, index) => [item.runItemId, index]),
  );
  const drafts = new Map<number, PracticeCloudDraft>();
  for (const rawDraft of value.drafts) {
    if (!isPracticeRecord(rawDraft) || typeof rawDraft.runItemId !== "string") {
      return null;
    }
    const itemIndex = itemIndexById.get(rawDraft.runItemId);
    if (itemIndex === undefined || drafts.has(itemIndex)) return null;
    const draft = parseDraft(rawDraft.answer, items[itemIndex]);
    if (draft === null) return null;
    drafts.set(itemIndex, draft);
  }
  return {
    version: value.version as number,
    currentIndex: (value.currentOrdinal as number) - 1,
    activeDurationMs,
    updatedAt: value.updatedAt as string,
    drafts,
  };
}

function parseDraft(
  value: unknown,
  item: PracticeCloudItem,
): PracticeCloudDraft | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !isPracticeRecord(payload) ||
    Object.keys(payload).toSorted().join(",") !==
      "answers,helpLevel,nextAttempt,version" ||
    payload.version !== 1 ||
    !isPracticeInteger(
      payload.nextAttempt,
      1,
      MAX_PRACTICE_ATTEMPTS_PER_TASK,
    ) ||
    !isPracticeInteger(payload.helpLevel, 0, 3)
  ) {
    return null;
  }
  const answers = parseAnswerArray(payload.answers, item.task.answerPartCount);
  if (answers === null) return null;

  const attemptCount = item.attempts.length;
  const latest = item.attempts.at(-1);
  const terminal = latest !== undefined && isTerminal(latest.outcome);
  const current =
    attemptCount < MAX_PRACTICE_ATTEMPTS_PER_TASK &&
    !terminal &&
    payload.nextAttempt === attemptCount + 1 &&
    (latest === undefined || payload.helpLevel >= latest.helpLevel);
  const stale =
    latest !== undefined &&
    payload.nextAttempt === attemptCount &&
    payload.helpLevel === latest.helpLevel &&
    arraysEqual(answers, latest.answers);
  if (!current && !stale) return null;
  return {
    nextAttempt: payload.nextAttempt as number,
    answers,
    helpLevel: payload.helpLevel as number,
    stale,
  };
}

function hasGlobalCausalOrder(
  attempts: readonly PracticeCloudAttempt[],
  runStartedAt: number,
): boolean {
  const ordered = attempts.toSorted(
    (left, right) =>
      left.submittedAt - right.submittedAt ||
      left.startedAt - right.startedAt ||
      left.id.localeCompare(right.id),
  );
  let previousSubmittedAt = runStartedAt;
  let hasPrevious = false;
  for (const attempt of ordered) {
    if (
      attempt.startedAt < previousSubmittedAt ||
      (hasPrevious && attempt.submittedAt <= previousSubmittedAt)
    ) {
      return false;
    }
    previousSubmittedAt = attempt.submittedAt;
    hasPrevious = true;
  }
  return true;
}

function firstUnfinishedIndex(items: readonly PracticeCloudItem[]): number {
  const index = items.findIndex((item) => {
    const latest = item.attempts.at(-1);
    return latest === undefined || !isTerminal(latest.outcome);
  });
  return index < 0 ? Math.max(0, items.length - 1) : index;
}

function parseAnswers(value: unknown, partCount: number): string[] | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  try {
    return parseAnswerArray(JSON.parse(value), partCount);
  } catch {
    return null;
  }
}

function parseAnswerArray(value: unknown, partCount: number): string[] | null {
  return Array.isArray(value) &&
    value.length === partCount &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
    ? [...value]
    : null;
}

function parseOutcome(value: unknown): PracticeCloudAttempt["outcome"] | null {
  if (value === "CORRECT") return "correct";
  if (value === "INCORRECT") return "incorrect";
  if (value === "SKIPPED") return "skipped";
  return null;
}

function isTerminal(outcome: PracticeCloudAttempt["outcome"]): boolean {
  return outcome === "correct" || outcome === "skipped";
}

function parseActiveDuration(
  value: unknown,
  elapsedMs: number,
): number | null | undefined {
  if (value === null || value === undefined) return null;
  return isPracticeInteger(
    value,
    0,
    Math.max(0, elapsedMs + PRACTICE_CLIENT_CLOCK_SKEW_MS),
  )
    ? value
    : undefined;
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
