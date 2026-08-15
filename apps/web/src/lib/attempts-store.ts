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
  practiceJournalFingerprint,
  projectPracticeRuntimeAttempts,
} from "./practice-runtime-journal";
import { usePracticeRuntime } from "./practice-runtime-store";

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
let flushChain: Promise<void> = Promise.resolve();
let fetchSequence = 0;
let view: Attempt[] | null = null;
let journalSnapshot: AttemptJournalSnapshot | null = null;
const listeners = new Set<() => void>();

usePracticeRuntime.subscribe(() => emit());

export function attemptsView(): Attempt[] | null {
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
    emit();
    return;
  }

  const ownerChanged = activeOwnerId !== userId;
  activeOwnerId = userId;
  if (userId === null) {
    fetchSequence += 1;
    serverAttempts = null;
    serverUnavailable = false;
    emit();
    return;
  }

  localAttempts ??= loadStoredAttempts();
  const claimed = removeRuntimeStandaloneDuplicates(
    localAttempts.map((attempt) => claimAttemptOwner(attempt, userId)),
    userId,
  );
  if (
    claimed.length !== localAttempts.length ||
    claimed.some((attempt, index) => attempt !== localAttempts?.[index])
  ) {
    if (!saveLocal(claimed)) {
      serverUnavailable = true;
      emit();
      return;
    }
  }
  if (ownerChanged) {
    serverAttempts = null;
    serverUnavailable = false;
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

export async function acknowledgePracticeRuntimeRun(
  userId: string,
  attemptIds: readonly string[],
  isRuntimeOwnerCurrent: () => boolean,
  signal?: AbortSignal,
): Promise<boolean> {
  const generation = authGeneration;
  if (
    activeOwnerId !== userId ||
    !isUuid(userId) ||
    attemptIds.length === 0 ||
    new Set(attemptIds).size !== attemptIds.length ||
    !attemptIds.every(isUuid) ||
    !isRuntimeOwnerCurrent()
  ) {
    return false;
  }
  try {
    if (!(await fetchServer(userId, generation, signal))) return false;
  } catch {
    if (isCurrentOwner(userId, generation)) {
      serverUnavailable = true;
      emit();
    }
    return false;
  }
  if (!isCurrentOwner(userId, generation) || !isRuntimeOwnerCurrent()) {
    return false;
  }
  const serverIds = new Set(
    (serverAttempts ?? []).flatMap((entry) =>
      entry.id === null ? [] : [entry.id],
    ),
  );
  emit();
  return attemptIds.every((attemptId) => serverIds.has(attemptId));
}

export function clearLocalAttempts(): void {
  authGeneration += 1;
  activeOwnerId = null;
  fetchSequence += 1;
  serverAttempts = null;
  serverUnavailable = false;
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
  const serverIds = new Set(
    (serverAttempts ?? []).flatMap((entry) =>
      entry.id === null ? [] : [entry.id],
    ),
  );
  const runtime = projectPracticeRuntimeAttempts(
    usePracticeRuntime.getState().runs,
    ownerId,
  );
  const runtimeFingerprints = new Set(
    runtime.map(({ journal }) => practiceJournalFingerprint(journal)),
  );
  const local = (localAttempts ?? [])
    .filter((attempt) => isAttemptVisible(attempt, ownerId))
    .filter(
      (attempt) =>
        attempt.transport !== "graphql-standalone" ||
        (!serverIds.has(attempt.input.id) &&
          !runtimeFingerprints.has(
            practiceJournalFingerprint(toJournalAttempt(attempt)),
          )),
    )
    .flatMap(toMasteryAttempt);
  return [
    ...(serverAttempts ?? []).flatMap(({ attempt }) =>
      attempt === null ? [] : [attempt],
    ),
    ...runtime
      .filter(({ id }) => !serverIds.has(id))
      .flatMap(({ attempt }) => (attempt === null ? [] : [attempt])),
    ...local,
  ].toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function mergedJournal(): JournalAttempt[] {
  const ownerId = activeOwnerId ?? null;
  const serverJournal = (serverAttempts ?? []).flatMap(({ journal }) =>
    journal === null ? [] : [journal],
  );
  const serverIds = new Set(serverJournal.map(({ id }) => id));
  const runtimeJournal = projectPracticeRuntimeAttempts(
    usePracticeRuntime.getState().runs,
    ownerId,
  ).map(({ journal }) => journal);
  const runtimeFingerprints = new Set(
    runtimeJournal.map(practiceJournalFingerprint),
  );
  const localJournal = (localAttempts ?? [])
    .filter(
      (attempt): attempt is PendingPracticeAttempt =>
        attempt.transport === "graphql-standalone" &&
        isAttemptVisible(attempt, ownerId) &&
        !serverIds.has(attempt.input.id) &&
        !runtimeFingerprints.has(
          practiceJournalFingerprint(toJournalAttempt(attempt)),
        ),
    )
    .map(toJournalAttempt);
  return [
    ...serverJournal,
    ...runtimeJournal.filter(({ id }) => !serverIds.has(id)),
    ...localJournal,
  ].toSorted((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

function journalStatus(): AttemptJournalSnapshot["status"] {
  if (!activeOwnerId) return "guest";
  if (serverUnavailable) return "degraded";
  const serverIds = new Set(
    (serverAttempts ?? []).flatMap(({ journal }) =>
      journal === null ? [] : [journal.id],
    ),
  );
  const runtime = projectPracticeRuntimeAttempts(
    usePracticeRuntime.getState().runs,
    activeOwnerId,
  );
  const runtimeFingerprints = new Set(
    runtime.map(({ journal }) => practiceJournalFingerprint(journal)),
  );
  if (runtime.some(({ id }) => !serverIds.has(id))) return "degraded";
  return (localAttempts ?? []).some(
    (attempt) =>
      attempt.transport === "graphql-standalone" &&
      attempt.ownerId === activeOwnerId &&
      !serverIds.has(attempt.input.id) &&
      !runtimeFingerprints.has(
        practiceJournalFingerprint(toJournalAttempt(attempt)),
      ),
  )
    ? "degraded"
    : "synced";
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
    const retained = removeRuntimeStandaloneDuplicates(localAttempts, userId);
    if (retained.length !== localAttempts.length) {
      if (!saveLocal(retained)) {
        throw new Error("could not discard a duplicate standalone attempt");
      }
      continue;
    }
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
  signal?: AbortSignal,
): Promise<boolean> {
  const sequence = ++fetchSequence;
  const parsed = await fetchAttemptJournal(signal);
  if (sequence !== fetchSequence || !isCurrentOwner(userId, generation)) {
    return false;
  }
  serverAttempts = parsed;
  serverUnavailable = false;
  return true;
}

function removeRuntimeStandaloneDuplicates(
  attempts: readonly StoredAttempt[],
  ownerId: string,
): StoredAttempt[] {
  const runtimeFingerprints = new Set(
    projectPracticeRuntimeAttempts(
      usePracticeRuntime.getState().runs,
      ownerId,
    ).map(({ journal }) => practiceJournalFingerprint(journal)),
  );
  if (runtimeFingerprints.size === 0) return [...attempts];
  return attempts.filter(
    (attempt) =>
      attempt.transport !== "graphql-standalone" ||
      attempt.ownerId !== ownerId ||
      !runtimeFingerprints.has(
        practiceJournalFingerprint(toJournalAttempt(attempt)),
      ),
  );
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
  return () => listeners.delete(listener);
}

function emit(): void {
  view = null;
  journalSnapshot = null;
  for (const listener of listeners) listener();
}
