import { validate as isUuid } from "uuid";
import { acknowledgeGraphQLRun } from "./attempts-store";
import { refreshHistoryRuns } from "./history-run-store";
import {
  parseCompletedProgressRun,
  type CompletedProgressAttempt,
  type CompletedProgressRun,
} from "./progress-run";
import { withRunSyncLock } from "./run-sync-lock";

const STORAGE_KEY = "do-indeksa-progress-outbox";
const RECEIPT_STORAGE_KEY = "do-indeksa-progress-receipts";
const STORAGE_VERSION = 1;
const MAX_PENDING_RUNS = 20;
const MAX_SYNCED_RUNS = 50;
const MAX_STORAGE_CHARACTERS = 4_000_000;

type PendingProgressRun = {
  ownerId: string | null;
  run: CompletedProgressRun;
};

let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let flushChain: Promise<void> = Promise.resolve();

const START_RUN = `
  mutation StartRun($input: StartRunInput!) {
    startRun(input: $input) { id }
  }
`;

const RECORD_ATTEMPT = `
  mutation RecordAttempt($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }
`;

const SUBMIT_RUN = `
  mutation SubmitRun($input: SubmitRunInput!) {
    submitRun(input: $input) { id status }
  }
`;

export async function queueCompletedProgressRun(
  value: CompletedProgressRun,
): Promise<boolean> {
  const run = parseCompletedProgressRun(value);
  if (run === null) return false;

  const pending = loadOutbox();
  if (isProgressRunSynced(run.id)) {
    saveOutbox(pending.filter((entry) => entry.run.id !== run.id));
    return true;
  }
  const existing = pending.find((entry) => entry.run.id === run.id);
  const ownerId = activeOwnerId ?? null;
  if (existing) {
    if (
      existing.ownerId !== ownerId ||
      JSON.stringify(existing.run) !== JSON.stringify(run)
    ) {
      return false;
    }
  } else {
    if (pending.length >= MAX_PENDING_RUNS) return false;
    pending.push({ ownerId, run });
    if (!saveOutbox(pending)) return false;
  }

  if (activeOwnerId) await scheduleFlush(activeOwnerId, authGeneration);
  return true;
}

export async function syncProgress(userId: string | null): Promise<void> {
  if (userId !== null && !isUuid(userId)) {
    activeOwnerId = null;
    authGeneration += 1;
    return;
  }
  const generation = ++authGeneration;
  activeOwnerId = userId;
  if (userId === null) return;

  const pending = loadOutbox();
  let claimed = false;
  for (const entry of pending) {
    if (entry.ownerId === null) {
      entry.ownerId = userId;
      claimed = true;
    }
  }
  if (claimed && !saveOutbox(pending)) return;
  await scheduleFlush(userId, generation);
}

export function clearProgressSync(): void {
  activeOwnerId = null;
  authGeneration += 1;
  const guestRuns = loadOutbox().filter((entry) => entry.ownerId === null);
  saveOutbox(guestRuns);
}

export function isProgressRunSynced(runId: string): boolean {
  return isUuid(runId) && loadReceipts().includes(runId);
}

function scheduleFlush(userId: string, generation: number): Promise<void> {
  flushChain = flushChain
    .then(() => flushOwner(userId, generation))
    .catch(() => {});
  return flushChain;
}

async function flushOwner(userId: string, generation: number): Promise<void> {
  while (isCurrentOwner(userId, generation)) {
    const entry = loadOutbox().find(
      (candidate) => candidate.ownerId === userId,
    );
    if (!entry) return;
    if (isProgressRunSynced(entry.run.id)) {
      const pending = loadOutbox();
      if (
        !saveOutbox(
          pending.filter((candidate) => candidate.run.id !== entry.run.id),
        )
      ) {
        return;
      }
      continue;
    }
    try {
      await withRunSyncLock(entry.run.id, () =>
        sendRun(entry.run, () => isCurrentOwner(userId, generation)),
      );
    } catch {
      return;
    }
    if (!isCurrentOwner(userId, generation)) return;

    const acknowledged = await acknowledgeGraphQLRun(entry.run.id);
    if (!acknowledged || !isCurrentOwner(userId, generation)) return;
    if (!recordReceipt(entry.run.id)) return;

    const pending = loadOutbox();
    const current = pending.find(
      (candidate) => candidate.run.id === entry.run.id,
    );
    if (
      current?.ownerId !== userId ||
      JSON.stringify(current.run) !== JSON.stringify(entry.run)
    ) {
      return;
    }
    if (!saveOutbox(pending.filter((candidate) => candidate !== current))) {
      return;
    }
    if (entry.run.kind !== "SIMULATION") void refreshHistoryRuns(userId);
  }
}

function isCurrentOwner(userId: string, generation: number): boolean {
  return activeOwnerId === userId && authGeneration === generation;
}

async function sendRun(
  run: CompletedProgressRun,
  isCurrent: () => boolean,
): Promise<void> {
  requireCurrentOwner(isCurrent);
  await mutate(
    "StartRun",
    START_RUN,
    "startRun",
    {
      id: run.id,
      kind: run.kind,
      blueprintVersion: run.blueprintVersion,
      contentRevision: run.contentRevision,
      startedAt: run.startedAt,
      ...(run.deadlineAt === undefined ? {} : { deadlineAt: run.deadlineAt }),
      items: run.items.map((item) => ({
        id: item.id,
        taskId: item.taskId,
        examPosition: item.examPosition,
        topic: item.topic,
        ...(item.maxPoints === undefined ? {} : { maxPoints: item.maxPoints }),
        ...(item.answerPartCount === undefined
          ? {}
          : { answerPartCount: item.answerPartCount }),
        taskRevision: item.taskRevision,
      })),
    },
    run.id,
  );

  for (const item of run.items) {
    for (const attempt of item.previousAttempt === undefined
      ? [item.attempt]
      : [item.previousAttempt, item.attempt]) {
      requireCurrentOwner(isCurrent);
      await sendAttempt(item.id, attempt, isCurrent);
    }
  }

  requireCurrentOwner(isCurrent);
  const submitted = await mutate(
    "SubmitRun",
    SUBMIT_RUN,
    "submitRun",
    {
      id: run.id,
      submittedAt: run.submittedAt,
      ...(run.activeDurationMs === undefined
        ? {}
        : { activeDurationMs: run.activeDurationMs }),
    },
    run.id,
  );
  if (submitted.status !== "SUBMITTED") {
    throw new Error("progress run was not submitted");
  }
}

async function sendAttempt(
  runItemId: string,
  attempt: CompletedProgressAttempt,
  isCurrent: () => boolean,
): Promise<void> {
  requireCurrentOwner(isCurrent);
  await mutate(
    "RecordAttempt",
    RECORD_ATTEMPT,
    "recordAttempt",
    {
      id: attempt.id,
      runItemId,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      ...(attempt.activeDurationMs === undefined
        ? {}
        : { activeDurationMs: attempt.activeDurationMs }),
      ...(attempt.answer === undefined ? {} : { answer: attempt.answer }),
      outcome: attempt.outcome,
      helpLevel: attempt.helpLevel,
      gradingKind: attempt.gradingKind,
      ...(attempt.earnedPoints === undefined
        ? {}
        : { earnedPoints: attempt.earnedPoints }),
    },
    attempt.id,
  );
}

function requireCurrentOwner(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error("progress owner changed");
}

async function mutate(
  operationName: string,
  query: string,
  field: string,
  input: Record<string, unknown>,
  expectedId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ operationName, query, variables: { input } }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    (payload.errors !== undefined &&
      (!Array.isArray(payload.errors) || payload.errors.length > 0)) ||
    !isRecord(payload.data)
  ) {
    throw new Error("GraphQL request returned an error");
  }
  const result = payload.data[field];
  if (!isRecord(result) || result.id !== expectedId) {
    throw new Error("GraphQL request returned an invalid result");
  }
  return result;
}

function loadOutbox(): PendingProgressRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORAGE_CHARACTERS) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== STORAGE_VERSION ||
      !Array.isArray(value.pending) ||
      value.pending.length > MAX_PENDING_RUNS
    ) {
      return [];
    }
    const result: PendingProgressRun[] = [];
    const runIds = new Set<string>();
    for (const candidate of value.pending) {
      if (!isRecord(candidate)) continue;
      const ownerId = candidate.ownerId;
      if (
        ownerId !== null &&
        (typeof ownerId !== "string" || !isUuid(ownerId))
      ) {
        continue;
      }
      const run = parseCompletedProgressRun(candidate.run);
      if (run === null || runIds.has(run.id)) continue;
      runIds.add(run.id);
      result.push({ ownerId, run });
    }
    return result;
  } catch {
    return [];
  }
}

function saveOutbox(pending: PendingProgressRun[]): boolean {
  try {
    if (pending.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    if (pending.length > MAX_PENDING_RUNS) return false;
    const raw = JSON.stringify({ version: STORAGE_VERSION, pending });
    if (raw.length > MAX_STORAGE_CHARACTERS) return false;
    localStorage.setItem(STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

function loadReceipts(): string[] {
  try {
    const raw = localStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw || raw.length > 4_000) return [];
    const value: unknown = JSON.parse(raw);
    const runIds = isRecord(value) ? value.runIds : undefined;
    if (
      !isRecord(value) ||
      value.version !== STORAGE_VERSION ||
      !Array.isArray(runIds) ||
      runIds.length > MAX_SYNCED_RUNS
    ) {
      return [];
    }
    return runIds.filter(
      (runId, index): runId is string =>
        typeof runId === "string" &&
        isUuid(runId) &&
        runIds.indexOf(runId) === index,
    );
  } catch {
    return [];
  }
}

function recordReceipt(runId: string): boolean {
  try {
    const runIds = loadReceipts().filter((candidate) => candidate !== runId);
    runIds.push(runId);
    localStorage.setItem(
      RECEIPT_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        runIds: runIds.slice(-MAX_SYNCED_RUNS),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
