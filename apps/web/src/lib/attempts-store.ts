import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import {
  fetchAttemptJournal,
  sendLegacyAttempts,
  sendPracticeAttempt,
} from "./attempt-client";
import type { Attempt } from "./knowledge";
import {
  MAX_STORED_ATTEMPTS,
  claimAttemptOwner,
  createPendingPracticeAttempt,
  isAttemptVisible,
  isPublicAttempt,
  toJournalAttempt,
  toPublicAttempt,
  type JournalAttempt,
  type PendingLegacyAttempt,
  type PendingPracticeAttempt,
  type PracticeAttemptInput,
  type ServerAttempt,
  type StoredAttempt,
} from "./attempt-journal";
import { loadStoredAttempts, writeStoredAttempts } from "./attempt-storage";
import {
  practiceRuntimeAttempts,
  samePracticeAction,
  uniqueAttemptIds,
} from "./practice-attempt-view";
import { usePracticeRuntime } from "./practice-runtime-store";
import type { PersistedPracticeRun } from "./practice-runtime-types";

const LEGACY_BATCH_SIZE = 500;

type ServerViewAttempt =
  ServerAttempt | { id: null; attempt: Attempt; journal: null };

export type AttemptJournalSnapshot = {
  status: "guest" | "synced" | "degraded";
  entries: readonly JournalAttempt[];
};

let localAttempts: StoredAttempt[] | null = null;
let serverAttempts: ServerViewAttempt[] | null = null;
let authKnown = false;
let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let serverUnavailable = false;
let acknowledgedAttempts: ServerAttempt[] = [];
let acknowledgedOwnerId: string | null = null;
let flushChain: Promise<void> = Promise.resolve();
let fetchSequence = 0;
let view: Attempt[] | null = null;
let journalSnapshot: AttemptJournalSnapshot | null = null;
let projectedRuntimeRuns = usePracticeRuntime.getState().runs;
const listeners = new Set<() => void>();
let unsubscribePracticeRuntime: (() => void) | null = null;

export function attemptsView(): Attempt[] | null {
  invalidateChangedRuntime();
  if (!authKnown) return null;
  localAttempts ??= loadStoredAttempts();
  if (
    activeOwnerId !== null &&
    activeOwnerId !== undefined &&
    serverAttempts === null &&
    !serverUnavailable
  ) {
    return null;
  }
  view ??= merged();
  return view;
}

export function attemptJournalView(): AttemptJournalSnapshot | null {
  invalidateChangedRuntime();
  if (!authKnown) return null;
  localAttempts ??= loadStoredAttempts();
  if (
    activeOwnerId !== null &&
    activeOwnerId !== undefined &&
    serverAttempts === null &&
    !serverUnavailable
  ) {
    return null;
  }
  journalSnapshot ??= {
    status: journalStatus(),
    entries: mergedJournal(),
  };
  return journalSnapshot;
}

export async function syncAttempts(userId: string | null): Promise<void> {
  authKnown = true;
  const generation = ++authGeneration;
  if (userId !== null && !isUuid(userId)) {
    activeOwnerId = null;
    fetchSequence += 1;
    serverAttempts = null;
    serverUnavailable = false;
    clearAcknowledgedAttempts();
    emit();
    return;
  }

  const ownerChanged = activeOwnerId !== userId;
  activeOwnerId = userId;
  if (userId === null) {
    fetchSequence += 1;
    serverAttempts = null;
    serverUnavailable = false;
    clearAcknowledgedAttempts();
    emit();
    return;
  }

  localAttempts ??= loadStoredAttempts();
  const claimed = localAttempts.map((attempt) =>
    claimAttemptOwner(attempt, userId),
  );
  if (claimed.some((attempt, index) => attempt !== localAttempts?.[index])) {
    if (!saveLocal(claimed)) {
      serverUnavailable = true;
      emit();
      return;
    }
  }
  if (ownerChanged) {
    serverAttempts = null;
    serverUnavailable = false;
    if (acknowledgedOwnerId !== userId) clearAcknowledgedAttempts();
    emit();
  }

  await scheduleFlush(userId, generation);
  try {
    await fetchServer(userId, generation);
  } catch {
    if (isCurrentOwner(userId, generation)) serverUnavailable = true;
  }
  if (isCurrentOwner(userId, generation)) emit();
}

export function recordPracticeAttempt(value: PracticeAttemptInput): boolean {
  localAttempts ??= loadStoredAttempts();
  if (localAttempts.length >= MAX_STORED_ATTEMPTS) return false;
  const ownerId = activeOwnerId ?? null;
  const attempt = createPendingPracticeAttempt(value, ownerId);
  if (attempt === null) return false;
  if (!saveLocal([...localAttempts, attempt])) return false;
  emit();

  if (activeOwnerId) {
    const userId = activeOwnerId;
    const generation = authGeneration;
    void scheduleFlush(userId, generation)
      .then(() => fetchServer(userId, generation))
      .then(emit, () => emit());
  }
  return true;
}

export function acknowledgePracticeRuntimeRun(
  userId: string,
  run: PersistedPracticeRun,
): boolean {
  if (
    (typeof activeOwnerId === "string" && activeOwnerId !== userId) ||
    (acknowledgedOwnerId !== null && acknowledgedOwnerId !== userId) ||
    run.runOwnerId !== userId ||
    run.phase !== "submitting" ||
    run.submission === null ||
    run.items.some(
      (item, index) => run.syncedAttemptCounts[index] !== item.attempts.length,
    )
  ) {
    return false;
  }
  const confirmed = practiceRuntimeAttempts([run]);
  const expectedAttemptCount = run.items.reduce(
    (total, item) => total + item.attempts.length,
    0,
  );
  if (confirmed.length !== expectedAttemptCount) return false;
  const confirmedIds = new Set(confirmed.map(({ id }) => id));
  if (confirmedIds.size !== expectedAttemptCount) return false;
  localAttempts ??= loadStoredAttempts();
  const retained = localAttempts.filter((attempt) => {
    if (
      attempt.transport === "graphql" &&
      attempt.runId === run.assignment.runId &&
      attempt.ownerId === userId
    ) {
      return false;
    }
    if (
      attempt.transport !== "graphql-standalone" ||
      (attempt.ownerId !== null && attempt.ownerId !== userId)
    ) {
      return true;
    }
    return !confirmed.some((entry) =>
      samePracticeAction(entry.journal, toJournalAttempt(attempt)),
    );
  });
  if (retained.length !== localAttempts.length && !saveLocal(retained)) {
    return false;
  }
  acknowledgedOwnerId = userId;
  acknowledgedAttempts = uniqueAttemptIds([
    ...acknowledgedAttempts,
    ...confirmed,
  ]).slice(-MAX_STORED_ATTEMPTS);
  if (confirmedIds.size > 0) emit();
  return true;
}

export function recordGraphQLAttempts(
  runId: string,
  entries: Attempt[],
): boolean {
  if (!isUuid(runId) || !entries.every(isPublicAttempt)) return false;
  localAttempts ??= loadStoredAttempts();
  const ownerId = activeOwnerId ?? null;
  const retained = localAttempts.filter(
    (attempt) =>
      attempt.transport !== "graphql" ||
      attempt.runId !== runId ||
      attempt.ownerId !== ownerId,
  );
  if (retained.length + entries.length > MAX_STORED_ATTEMPTS) return false;
  retained.push(
    ...entries.map((entry) => ({
      ...toPublicAttempt(entry),
      transport: "graphql" as const,
      runId,
      ownerId,
    })),
  );
  if (!saveLocal(retained)) return false;
  emit();
  return true;
}

export async function acknowledgeGraphQLRun(runId: string): Promise<boolean> {
  const userId = activeOwnerId;
  const generation = authGeneration;
  if (!userId || !isUuid(runId)) return false;
  try {
    if (!(await fetchServer(userId, generation))) return false;
  } catch {
    if (isCurrentOwner(userId, generation)) {
      serverUnavailable = true;
      emit();
    }
    return false;
  }
  if (!isCurrentOwner(userId, generation)) return false;
  localAttempts ??= loadStoredAttempts();
  if (
    !saveLocal(
      localAttempts.filter(
        (attempt) =>
          attempt.transport !== "graphql" ||
          attempt.runId !== runId ||
          attempt.ownerId !== userId,
      ),
    )
  ) {
    return false;
  }
  emit();
  return true;
}

export function clearLocalAttempts(): void {
  authGeneration += 1;
  activeOwnerId = null;
  fetchSequence += 1;
  serverAttempts = null;
  serverUnavailable = false;
  clearAcknowledgedAttempts();
  authKnown = true;
  writeStoredAttempts([]);
  localAttempts = [];
  emit();
}

export function useAttempts(): Attempt[] | null {
  return useSyncExternalStore(subscribe, attemptsView, () => null);
}

export function useAttemptJournal(): AttemptJournalSnapshot | null {
  return useSyncExternalStore(subscribe, attemptJournalView, () => null);
}

function merged(): Attempt[] {
  const ownerId = activeOwnerId ?? null;
  const runtime = practiceRuntimeAttempts(
    usePracticeRuntime
      .getState()
      .runs.filter((run) => run.runOwnerId === ownerId),
  );
  const canonical = canonicalPracticeEntries([
    ...(serverAttempts ?? []),
    ...currentAcknowledgedAttempts(ownerId),
    ...runtime,
  ]);
  const serverIds = new Set(
    canonical.flatMap((entry) => (entry.id === null ? [] : [entry.id])),
  );
  const canonicalActions = canonical.flatMap(({ journal }) =>
    journal?.runItemId === undefined ? [] : [journal],
  );
  const local = (localAttempts ?? [])
    .filter((attempt) => isAttemptVisible(attempt, ownerId))
    .filter(
      (attempt) =>
        attempt.transport !== "graphql-standalone" ||
        (!serverIds.has(attempt.input.id) &&
          !canonicalActions.some((canonical) =>
            samePracticeAction(canonical, toJournalAttempt(attempt)),
          )),
    )
    .flatMap(toMasteryAttempt);
  return [
    ...canonical.flatMap(({ attempt }) => (attempt === null ? [] : [attempt])),
    ...local,
  ].toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function mergedJournal(): JournalAttempt[] {
  const ownerId = activeOwnerId ?? null;
  const canonical = canonicalPracticeEntries([
    ...(serverAttempts ?? []),
    ...currentAcknowledgedAttempts(ownerId),
    ...practiceRuntimeAttempts(
      usePracticeRuntime
        .getState()
        .runs.filter((run) => run.runOwnerId === ownerId),
    ),
  ]);
  const serverJournal = canonical.flatMap(({ journal }) =>
    journal === null ? [] : [journal],
  );
  const serverIds = new Set(serverJournal.map(({ id }) => id));
  const canonicalActions = serverJournal.filter(
    ({ runItemId }) => runItemId !== undefined,
  );
  const localJournal = (localAttempts ?? [])
    .filter(
      (attempt): attempt is PendingPracticeAttempt =>
        attempt.transport === "graphql-standalone" &&
        isAttemptVisible(attempt, ownerId) &&
        !serverIds.has(attempt.input.id) &&
        !canonicalActions.some((canonical) =>
          samePracticeAction(canonical, toJournalAttempt(attempt)),
        ),
    )
    .map(toJournalAttempt);
  return [...serverJournal, ...localJournal].toSorted(
    (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
  );
}

function journalStatus(): AttemptJournalSnapshot["status"] {
  if (!activeOwnerId) return "guest";
  if (serverUnavailable) return "degraded";
  const serverIds = new Set(
    [
      ...(serverAttempts ?? []),
      ...currentAcknowledgedAttempts(activeOwnerId),
    ].flatMap(({ journal }) => (journal === null ? [] : [journal.id])),
  );
  const pendingStandalone = (localAttempts ?? []).some(
    (attempt) =>
      attempt.transport === "graphql-standalone" &&
      attempt.ownerId === activeOwnerId &&
      !serverIds.has(attempt.input.id),
  );
  const pendingRuntime = usePracticeRuntime
    .getState()
    .runs.some(
      (run) =>
        run.runOwnerId === activeOwnerId &&
        run.items.some(
          (item, index) =>
            run.syncedAttemptCounts[index] < item.attempts.length,
        ),
    );
  return pendingStandalone || pendingRuntime ? "degraded" : "synced";
}

function scheduleFlush(userId: string, generation: number): Promise<void> {
  flushChain = flushChain
    .then(() => flushOwner(userId, generation))
    .catch(() => {});
  return flushChain;
}

async function flushOwner(userId: string, generation: number): Promise<void> {
  while (isCurrentOwner(userId, generation)) {
    localAttempts ??= loadStoredAttempts();
    const legacy = localAttempts
      .filter(
        (attempt): attempt is PendingLegacyAttempt =>
          attempt.transport === "rest-legacy" && attempt.ownerId === userId,
      )
      .slice(0, LEGACY_BATCH_SIZE);
    if (legacy.length > 0) {
      const accepted = await sendLegacyAttempts(legacy);
      const sent = new Set<StoredAttempt>(legacy);
      if (!saveLocal(localAttempts.filter((attempt) => !sent.has(attempt)))) {
        throw new Error("could not persist the legacy attempt flush");
      }
      if (!isCurrentOwner(userId, generation)) return;
      if (accepted) {
        appendServer(
          legacy.map((attempt) => ({
            id: null,
            attempt: toPublicAttempt(attempt),
            journal: null,
          })),
        );
      }
      continue;
    }

    const pending = localAttempts.find(
      (attempt): attempt is PendingPracticeAttempt =>
        attempt.transport === "graphql-standalone" &&
        attempt.ownerId === userId,
    );
    if (pending === undefined) return;
    await sendPracticeAttempt(pending);
    if (!saveLocal(localAttempts.filter((attempt) => attempt !== pending))) {
      throw new Error("could not persist the practice attempt flush");
    }
    if (!isCurrentOwner(userId, generation)) return;
    appendServer([
      {
        id: pending.input.id,
        attempt:
          pending.input.outcome === "SKIPPED" ? null : toPublicAttempt(pending),
        journal: toJournalAttempt(pending),
      },
    ]);
  }
}

async function fetchServer(
  userId: string,
  generation: number,
): Promise<boolean> {
  const sequence = ++fetchSequence;
  const parsed = await fetchAttemptJournal();
  if (sequence !== fetchSequence || !isCurrentOwner(userId, generation)) {
    return false;
  }
  serverAttempts = parsed;
  const serverIds = new Set(parsed.map(({ id }) => id));
  acknowledgedAttempts = acknowledgedAttempts.filter(
    ({ id }) => !serverIds.has(id),
  );
  if (acknowledgedAttempts.length === 0) acknowledgedOwnerId = null;
  serverUnavailable = false;
  return true;
}

function appendServer(entries: ServerViewAttempt[]): void {
  const current = serverAttempts ?? [];
  const ids = new Set(
    current.flatMap((entry) => (entry.id === null ? [] : [entry.id])),
  );
  serverAttempts = [...current];
  for (const entry of entries) {
    if (entry.id !== null && ids.has(entry.id)) continue;
    serverAttempts.push(entry);
    if (entry.id !== null) ids.add(entry.id);
  }
  serverAttempts.sort(
    (a, b) => Date.parse(serverAt(a)) - Date.parse(serverAt(b)),
  );
}

function serverAt(entry: ServerViewAttempt): string {
  return entry.journal?.submittedAt ?? entry.attempt?.at ?? "";
}

function isCurrentOwner(userId: string, generation: number): boolean {
  return activeOwnerId === userId && authGeneration === generation;
}

function saveLocal(attempts: StoredAttempt[]): boolean {
  if (!writeStoredAttempts(attempts)) return false;
  localAttempts = attempts;
  return true;
}

function toMasteryAttempt(attempt: StoredAttempt): Attempt[] {
  return attempt.transport === "graphql-standalone" &&
    attempt.input.outcome === "SKIPPED"
    ? []
    : [toPublicAttempt(attempt)];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribePracticeRuntime = usePracticeRuntime.subscribe(emit);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribePracticeRuntime?.();
      unsubscribePracticeRuntime = null;
    }
  };
}

function emit(): void {
  projectedRuntimeRuns = usePracticeRuntime.getState().runs;
  view = null;
  journalSnapshot = null;
  for (const listener of listeners) listener();
}

function invalidateChangedRuntime(): void {
  const runs = usePracticeRuntime.getState().runs;
  if (runs === projectedRuntimeRuns) return;
  projectedRuntimeRuns = runs;
  view = null;
  journalSnapshot = null;
}

function canonicalPracticeEntries(
  entries: readonly ServerViewAttempt[],
): ServerViewAttempt[] {
  const unique = uniqueAttemptIds(entries);
  const canonical = unique.flatMap(({ journal }) =>
    journal?.runItemId === undefined ? [] : [journal],
  );
  return unique.filter(
    ({ journal }) =>
      journal === null ||
      journal.runItemId !== undefined ||
      !canonical.some((candidate) => samePracticeAction(candidate, journal)),
  );
}

function currentAcknowledgedAttempts(
  ownerId: string | null | undefined,
): ServerAttempt[] {
  return ownerId !== null && ownerId === acknowledgedOwnerId
    ? acknowledgedAttempts
    : [];
}

function clearAcknowledgedAttempts(): void {
  acknowledgedAttempts = [];
  acknowledgedOwnerId = null;
}
