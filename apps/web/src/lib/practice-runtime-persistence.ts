import { isPracticeCloudAssignment } from "./practice-cloud-contract";
import { isLearningRunOwner } from "./learning-run-owner";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAttempt,
  type PracticeCloudAttemptOutcome,
  type PracticeCloudDraftInput,
  type PracticeCloudTask,
} from "./practice-cloud-types";
import {
  MAX_LOCAL_PRACTICE_RUNS,
  type PersistedPracticeRun,
  type PersistedPracticeRuntimeState,
  type PracticeCheckpointFlight,
  type PracticeRuntimeDraft,
  type PracticeRuntimeItem,
} from "./practice-runtime-types";

const CLIENT_CLOCK_SKEW_MS = 5 * 60_000;

export function emptyPracticeRuntimeState(): PersistedPracticeRuntimeState {
  return { runs: [] };
}

export function parsePersistedPracticeRuntimeState(
  value: unknown,
): PersistedPracticeRuntimeState {
  if (!isRecord(value) || !Array.isArray(value.runs)) {
    return emptyPracticeRuntimeState();
  }
  if (
    value.runs.length > MAX_LOCAL_PRACTICE_RUNS ||
    value.runs.some((candidate) => !isRecord(candidate))
  ) {
    return emptyPracticeRuntimeState();
  }

  const runs: PersistedPracticeRun[] = [];
  const runIds = new Set<string>();
  let owner: string | null | undefined;
  let ownerSet = false;
  for (const candidate of value.runs) {
    const parsed = parseRun(candidate);
    if (
      parsed === null ||
      runIds.has(parsed.assignment.runId) ||
      (ownerSet && parsed.runOwnerId !== owner)
    ) {
      return emptyPracticeRuntimeState();
    }
    if (!ownerSet) {
      owner = parsed.runOwnerId;
      ownerSet = true;
    }
    runIds.add(parsed.assignment.runId);
    runs.push(parsed);
  }
  return { runs };
}

export function migratePracticeRuntimeState(
  value: unknown,
  version: number,
): PersistedPracticeRuntimeState {
  return version < 1
    ? emptyPracticeRuntimeState()
    : parsePersistedPracticeRuntimeState(value);
}

function parseRun(value: Record<string, unknown>): PersistedPracticeRun | null {
  if (
    !isPracticeCloudAssignment(value.assignment) ||
    !isLearningRunOwner(value.runOwnerId) ||
    !isClientTime(value.startedAt) ||
    typeof value.startedRemotely !== "boolean" ||
    !isVersion(value.checkpointVersion) ||
    !isVersion(value.checkpointRevision) ||
    !Array.isArray(value.syncedAttemptCounts) ||
    !isInteger(value.currentIndex, 0, value.assignment.tasks.length - 1) ||
    !isDuration(value.activeDurationMs, value.startedAt) ||
    !Array.isArray(value.items) ||
    value.items.length !== value.assignment.tasks.length ||
    typeof value.checkpointDirty !== "boolean" ||
    (value.phase !== "active" && value.phase !== "submitting") ||
    !isClientTime(value.updatedAt) ||
    value.updatedAt < value.startedAt
  ) {
    return null;
  }

  const items: PracticeRuntimeItem[] = [];
  const attempts: PracticeCloudAttempt[] = [];
  for (const [index, rawItem] of value.items.entries()) {
    const item = parseItem(rawItem, value.assignment, index, value.startedAt);
    if (item === null) return null;
    items.push(item);
    attempts.push(...item.attempts);
  }
  if (!hasCausalAttemptOrder(attempts, value.startedAt)) return null;

  const syncedAttemptCounts = parseSyncedAttemptCounts(
    value.syncedAttemptCounts,
    items,
  );
  if (syncedAttemptCounts === null) return null;

  const checkpointFlight = parseCheckpointFlight(
    value.checkpointFlight,
    value.assignment.tasks,
    items,
    syncedAttemptCounts,
    value.checkpointVersion,
    value.checkpointRevision,
    value.activeDurationMs,
  );
  if (
    (!value.startedRemotely &&
      (value.checkpointVersion !== 0 ||
        syncedAttemptCounts.some((count) => count > 0) ||
        checkpointFlight !== null)) ||
    (value.runOwnerId === null && value.startedRemotely) ||
    !isValidSubmission(
      value.phase,
      value.submission,
      value.startedAt,
      value.activeDurationMs,
      attempts,
    )
  ) {
    return null;
  }

  return {
    assignment: {
      runId: value.assignment.runId,
      blueprintVersion: value.assignment.blueprintVersion,
      contentRevision: value.assignment.contentRevision,
      tasks: value.assignment.tasks.map(cloneTask),
    },
    runOwnerId: value.runOwnerId,
    startedAt: value.startedAt,
    startedRemotely: value.startedRemotely,
    checkpointVersion: value.checkpointVersion,
    checkpointRevision: value.checkpointRevision,
    syncedAttemptCounts,
    currentIndex: value.currentIndex,
    activeDurationMs: value.activeDurationMs,
    items,
    checkpointDirty: value.checkpointDirty,
    checkpointFlight,
    phase: value.phase,
    submission:
      value.phase === "submitting"
        ? {
            submittedAt: (value.submission as { submittedAt: number })
              .submittedAt,
            activeDurationMs: (value.submission as { activeDurationMs: number })
              .activeDurationMs,
          }
        : null,
    updatedAt: value.updatedAt,
  };
}

function parseItem(
  value: unknown,
  assignment: {
    runId: string;
    tasks: readonly PracticeCloudTask[];
  },
  index: number,
  runStartedAt: number,
): PracticeRuntimeItem | null {
  const task = assignment.tasks[index];
  if (
    !isRecord(value) ||
    value.taskId !== task.id ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > MAX_PRACTICE_ATTEMPTS_PER_TASK
  ) {
    return null;
  }
  const runItemId = progressRunItemId(assignment.runId, task.id);
  const attempts: PracticeCloudAttempt[] = [];
  let previousSubmittedAt = runStartedAt;
  let previousHelpLevel = 0;
  for (const [attemptIndex, candidate] of value.attempts.entries()) {
    const attempt = parseAttempt(
      candidate,
      task,
      runItemId,
      attemptIndex + 1,
      runStartedAt,
    );
    if (
      attempt === null ||
      attempt.startedAt < previousSubmittedAt ||
      (attemptIndex > 0 && attempt.helpLevel < previousHelpLevel) ||
      (attemptIndex < value.attempts.length - 1 && isTerminal(attempt.outcome))
    ) {
      return null;
    }
    attempts.push(attempt);
    previousSubmittedAt = attempt.submittedAt;
    previousHelpLevel = attempt.helpLevel;
  }
  const draft = parseDraft(value.draft, task, attempts);
  if (value.draft !== null && draft === null) return null;
  return { taskId: task.id, attempts, draft };
}

function parseAttempt(
  value: unknown,
  task: PracticeCloudTask,
  runItemId: string,
  number: number,
  runStartedAt: number,
): PracticeCloudAttempt | null {
  if (
    !isRecord(value) ||
    value.id !== progressPracticeAttemptId(runItemId, number) ||
    value.number !== number ||
    !isClientTime(value.startedAt) ||
    !isClientTime(value.submittedAt) ||
    value.startedAt < runStartedAt ||
    value.submittedAt < value.startedAt ||
    !isNullableAttemptDuration(
      value.activeDurationMs,
      value.submittedAt - value.startedAt,
    ) ||
    !isAnswers(value.answers, task.answerPartCount) ||
    !isOutcome(value.outcome) ||
    !isInteger(value.helpLevel, 0, 3)
  ) {
    return null;
  }
  return {
    id: value.id,
    number,
    startedAt: value.startedAt,
    submittedAt: value.submittedAt,
    activeDurationMs: value.activeDurationMs,
    answers: [...value.answers],
    outcome: value.outcome,
    helpLevel: value.helpLevel,
  };
}

function parseDraft(
  value: unknown,
  task: PracticeCloudTask,
  attempts: readonly PracticeCloudAttempt[],
): PracticeRuntimeDraft | null {
  if (value === null) return null;
  const latest = attempts.at(-1);
  if (
    !isRecord(value) ||
    attempts.length >= MAX_PRACTICE_ATTEMPTS_PER_TASK ||
    (latest !== undefined && isTerminal(latest.outcome)) ||
    value.nextAttempt !== attempts.length + 1 ||
    !isAnswers(value.answers, task.answerPartCount) ||
    !isInteger(value.helpLevel, latest?.helpLevel ?? 0, 3)
  ) {
    return null;
  }
  return {
    nextAttempt: value.nextAttempt,
    answers: [...value.answers],
    helpLevel: value.helpLevel,
  };
}

function parseSyncedAttemptCounts(
  value: unknown[],
  items: readonly PracticeRuntimeItem[],
): number[] | null {
  if (
    value.length !== items.length ||
    value.some(
      (count, index) => !isInteger(count, 0, items[index].attempts.length),
    )
  ) {
    return null;
  }
  const counts = [...value] as number[];
  const attempts = items
    .flatMap((item, itemIndex) =>
      item.attempts.map((attempt, attemptIndex) => ({
        attempt,
        synced: attemptIndex < counts[itemIndex],
      })),
    )
    .toSorted(compareAttempts);
  let sawPending = false;
  for (const entry of attempts) {
    if (!entry.synced) sawPending = true;
    else if (sawPending) return null;
  }
  return counts;
}

function parseCheckpointFlight(
  value: unknown,
  tasks: readonly PracticeCloudTask[],
  items: readonly PracticeRuntimeItem[],
  syncedAttemptCounts: readonly number[],
  checkpointVersion: number,
  checkpointRevision: number,
  activeDurationMs: number,
): PracticeCheckpointFlight | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^checkpoint:[a-z0-9:-]{1,160}$/.test(value.id) ||
    (value.purpose !== "attempt" && value.purpose !== "draft") ||
    (value.attemptId !== null && typeof value.attemptId !== "string") ||
    !isVersion(value.expectedVersion) ||
    !isNullableAppliedVersion(
      value.appliedVersion,
      value.expectedVersion,
      checkpointVersion,
    ) ||
    !isInteger(value.checkpointRevision, 0, checkpointRevision) ||
    !isInteger(value.currentIndex, 0, tasks.length - 1) ||
    !isInteger(value.activeDurationMs, 0, activeDurationMs) ||
    !Array.isArray(value.drafts)
  ) {
    return null;
  }
  let drafts: PracticeCloudDraftInput[] | null;
  if (value.purpose === "attempt") {
    const next = nextUnsyncedAttempt(items, syncedAttemptCounts);
    if (
      next === null ||
      value.attemptId !== next.attempt.id ||
      value.drafts.length !== 1
    ) {
      return null;
    }
    drafts = parseAttemptFlightDraft(value.drafts[0], tasks, next);
  } else if (value.attemptId !== null) {
    return null;
  } else {
    drafts = parseFlightDrafts(value.drafts, tasks, items);
  }
  if (drafts === null) return null;
  return {
    id: value.id,
    purpose: value.purpose,
    attemptId: value.attemptId,
    expectedVersion: value.expectedVersion,
    appliedVersion: value.appliedVersion,
    checkpointRevision: value.checkpointRevision,
    currentIndex: value.currentIndex,
    activeDurationMs: value.activeDurationMs,
    drafts,
  };
}

function parseAttemptFlightDraft(
  value: unknown,
  tasks: readonly PracticeCloudTask[],
  next: { taskId: string; attempt: PracticeCloudAttempt },
): PracticeCloudDraftInput[] | null {
  const task = tasks.find((candidate) => candidate.id === next.taskId);
  if (
    task === undefined ||
    !isRecord(value) ||
    value.taskId !== next.taskId ||
    value.nextAttempt !== next.attempt.number ||
    value.helpLevel !== next.attempt.helpLevel ||
    !isAnswers(value.answers, task.answerPartCount) ||
    !arraysEqual(value.answers, next.attempt.answers)
  ) {
    return null;
  }
  return [
    {
      taskId: next.taskId,
      nextAttempt: next.attempt.number,
      answers: [...value.answers],
      helpLevel: next.attempt.helpLevel,
    },
  ];
}

function parseFlightDrafts(
  value: unknown[],
  tasks: readonly PracticeCloudTask[],
  items: readonly PracticeRuntimeItem[],
): PracticeCloudDraftInput[] | null {
  if (value.length > tasks.length) return null;
  const taskIndexById = new Map(tasks.map((task, index) => [task.id, index]));
  const drafts: PracticeCloudDraftInput[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.taskId !== "string") {
      return null;
    }
    const index = taskIndexById.get(candidate.taskId);
    if (index === undefined || seen.has(candidate.taskId)) return null;
    const task = tasks[index];
    const attempts = items[index].attempts;
    const nextAttempt = candidate.nextAttempt;
    const previous =
      typeof nextAttempt === "number" ? attempts[nextAttempt - 2] : undefined;
    const precedingTerminal = attempts
      .slice(0, typeof nextAttempt === "number" ? nextAttempt - 1 : 0)
      .some((attempt) => isTerminal(attempt.outcome));
    if (
      !isInteger(
        nextAttempt,
        1,
        Math.min(MAX_PRACTICE_ATTEMPTS_PER_TASK, attempts.length + 1),
      ) ||
      precedingTerminal ||
      !isInteger(candidate.helpLevel, previous?.helpLevel ?? 0, 3) ||
      !isAnswers(candidate.answers, task.answerPartCount)
    ) {
      return null;
    }
    seen.add(candidate.taskId);
    drafts.push({
      taskId: candidate.taskId,
      nextAttempt,
      answers: [...candidate.answers],
      helpLevel: candidate.helpLevel,
    });
  }
  return drafts;
}

function nextUnsyncedAttempt(
  items: readonly PracticeRuntimeItem[],
  syncedAttemptCounts: readonly number[],
): { taskId: string; attempt: PracticeCloudAttempt } | null {
  return (
    items
      .flatMap((item, itemIndex) =>
        item.attempts
          .slice(syncedAttemptCounts[itemIndex])
          .map((attempt) => ({ taskId: item.taskId, attempt })),
      )
      .toSorted((left, right) => compareAttempts(left, right))[0] ?? null
  );
}

function isValidSubmission(
  phase: unknown,
  value: unknown,
  startedAt: number,
  activeDurationMs: number,
  attempts: readonly PracticeCloudAttempt[],
): boolean {
  if (phase === "active") return value === null;
  if (
    !isRecord(value) ||
    attempts.length === 0 ||
    !isClientTime(value.submittedAt) ||
    value.submittedAt < startedAt ||
    value.submittedAt <
      Math.max(...attempts.map(({ submittedAt }) => submittedAt)) ||
    value.activeDurationMs !== activeDurationMs
  ) {
    return false;
  }
  return isInteger(
    value.activeDurationMs,
    0,
    value.submittedAt - startedAt + CLIENT_CLOCK_SKEW_MS,
  );
}

function hasCausalAttemptOrder(
  attempts: readonly PracticeCloudAttempt[],
  startedAt: number,
): boolean {
  let previousSubmittedAt = startedAt;
  let hasPrevious = false;
  for (const attempt of attempts.toSorted(compareAttempts)) {
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

function compareAttempts(
  left: PracticeCloudAttempt | { attempt: PracticeCloudAttempt },
  right: PracticeCloudAttempt | { attempt: PracticeCloudAttempt },
): number {
  const leftAttempt = "attempt" in left ? left.attempt : left;
  const rightAttempt = "attempt" in right ? right.attempt : right;
  return (
    leftAttempt.submittedAt - rightAttempt.submittedAt ||
    leftAttempt.startedAt - rightAttempt.startedAt ||
    leftAttempt.id.localeCompare(rightAttempt.id)
  );
}

function cloneTask(task: PracticeCloudTask): PracticeCloudTask {
  return { ...task };
}

function isOutcome(value: unknown): value is PracticeCloudAttemptOutcome {
  return value === "correct" || value === "incorrect" || value === "skipped";
}

function isTerminal(outcome: PracticeCloudAttemptOutcome): boolean {
  return outcome === "correct" || outcome === "skipped";
}

function isAnswers(value: unknown, count: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  );
}

function isDuration(value: unknown, startedAt: number): value is number {
  return isInteger(
    value,
    0,
    Math.max(0, Date.now() - startedAt + CLIENT_CLOCK_SKEW_MS),
  );
}

function isNullableAttemptDuration(
  value: unknown,
  elapsedMs: number,
): value is number | null {
  return (
    value === null || isInteger(value, 0, elapsedMs + CLIENT_CLOCK_SKEW_MS)
  );
}

function isNullableAppliedVersion(
  value: unknown,
  expectedVersion: number,
  checkpointVersion: number,
): value is number | null {
  return value === null
    ? checkpointVersion === expectedVersion
    : value === expectedVersion + 1 && checkpointVersion === value;
}

function isVersion(value: unknown): value is number {
  return isInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function isClientTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Date.now() + CLIENT_CLOCK_SKEW_MS
  );
}

function isInteger(
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

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
