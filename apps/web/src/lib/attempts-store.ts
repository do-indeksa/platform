import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import type { Attempt, NewAttempt } from "@/lib/knowledge";

const STORAGE_KEY = "do-indeksa-attempts";
const MAX_BATCH = 500;
const MAX_TASK_ID = 64;
const TASK_ID_PATTERN = /^[a-z0-9-]+$/;
const SOURCES = new Set(["diagnostic", "practice", "simulation"]);

type StoredAttempt = Attempt & {
  transport?: "graphql";
  runId?: string;
};

let localAttempts: StoredAttempt[] | null = null;
let serverAttempts: Attempt[] | null = null;
let authKnown = false;
let signedIn = false;
let serverUnavailable = false;
let inFlightAttempts = new Set<StoredAttempt>();
let flushChain: Promise<void> = Promise.resolve();
let view: Attempt[] | null = null;
const listeners = new Set<() => void>();

function isAttempt(value: unknown): value is StoredAttempt {
  if (typeof value !== "object" || value === null) return false;
  const attempt = value as Record<string, unknown>;
  return (
    typeof attempt.taskId === "string" &&
    attempt.taskId.length <= MAX_TASK_ID &&
    TASK_ID_PATTERN.test(attempt.taskId) &&
    typeof attempt.slot === "number" &&
    Number.isInteger(attempt.slot) &&
    attempt.slot >= 1 &&
    attempt.slot <= 10 &&
    typeof attempt.correct === "boolean" &&
    typeof attempt.source === "string" &&
    SOURCES.has(attempt.source) &&
    typeof attempt.helpLevel === "number" &&
    Number.isInteger(attempt.helpLevel) &&
    attempt.helpLevel >= 0 &&
    attempt.helpLevel <= 3 &&
    typeof attempt.at === "string" &&
    !Number.isNaN(Date.parse(attempt.at)) &&
    ((attempt.transport === undefined && attempt.runId === undefined) ||
      (attempt.transport === "graphql" &&
        typeof attempt.runId === "string" &&
        isUuid(attempt.runId)))
  );
}

function loadLocal(): StoredAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { attempts } = JSON.parse(raw) as { attempts?: unknown[] };
    return (attempts ?? [])
      .map((value) =>
        typeof value === "object" && value !== null
          ? { helpLevel: 0, ...value }
          : value,
      )
      .filter(isAttempt);
  } catch {
    return [];
  }
}

function saveLocal(attempts: StoredAttempt[]): void {
  localAttempts = attempts;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, attempts }));
  } catch {}
}

export function attemptsView(): Attempt[] | null {
  if (!authKnown) return null;
  localAttempts ??= loadLocal();
  if (signedIn && serverAttempts === null && !serverUnavailable) return null;
  view ??= merged();
  return view;
}

function merged(): Attempt[] {
  const local = (localAttempts ?? []).map(toPublicAttempt);
  if (!signedIn || serverAttempts === null) return local;
  return [...serverAttempts, ...local].toSorted(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  view = null;
  for (const listener of listeners) listener();
}

async function flushAll(): Promise<void> {
  localAttempts ??= loadLocal();
  while (true) {
    const chunk = localAttempts
      .filter((attempt) => attempt.transport !== "graphql")
      .slice(0, MAX_BATCH);
    if (chunk.length === 0) return;
    inFlightAttempts = new Set(chunk);
    try {
      const res = await fetch("/api/v1/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map(toPublicAttempt)),
      });
      if (!res.ok && res.status !== 400) {
        throw new Error(`flush failed with status ${res.status}`);
      }
      if (res.ok) {
        serverAttempts = [
          ...(serverAttempts ?? []),
          ...chunk.map(toPublicAttempt),
        ];
      }
      saveLocal(
        localAttempts.filter((attempt) => !inFlightAttempts.has(attempt)),
      );
    } finally {
      inFlightAttempts = new Set();
    }
  }
}

function scheduleFlush(): Promise<void> {
  flushChain = flushChain.then(flushAll).catch(() => {});
  return flushChain;
}

let fetchSeq = 0;

async function fetchServer(): Promise<void> {
  const seq = ++fetchSeq;
  const res = await fetch("/api/v1/attempts");
  if (!res.ok)
    throw new Error(`attempts fetch failed with status ${res.status}`);
  const value: unknown = await res.json();
  if (!Array.isArray(value) || !value.every(isAttempt)) {
    throw new Error("attempts fetch returned an invalid response");
  }
  const attempts = value.map(toPublicAttempt);
  if (seq !== fetchSeq) return;
  serverAttempts = attempts;
  serverUnavailable = false;
}

export async function syncAttempts(isSignedIn: boolean): Promise<void> {
  authKnown = true;
  signedIn = isSignedIn;
  if (!isSignedIn) {
    serverAttempts = null;
    serverUnavailable = false;
    emit();
    return;
  }
  await scheduleFlush();
  try {
    await fetchServer();
  } catch {
    serverUnavailable = true;
  }
  emit();
}

export function recordAttempts(entries: Omit<NewAttempt, "at">[]): void {
  localAttempts ??= loadLocal();
  const at = new Date().toISOString();
  const next = [...localAttempts];
  for (const { helpLevel = 0, ...entry } of entries) {
    const last = next.at(-1);
    if (
      entry.source === "practice" &&
      last?.source === "practice" &&
      last.taskId === entry.taskId &&
      !inFlightAttempts.has(last)
    ) {
      next.pop();
    }
    next.push({ ...entry, helpLevel, at });
  }
  saveLocal(next);
  emit();
  if (signedIn) {
    void scheduleFlush()
      .then(fetchServer)
      .then(emit, () => emit());
  }
}

export function recordGraphQLAttempts(
  runId: string,
  entries: Attempt[],
): boolean {
  if (!isUuid(runId) || !entries.every(isAttempt)) return false;
  localAttempts ??= loadLocal();
  const next = localAttempts.filter(
    (attempt) => attempt.transport !== "graphql" || attempt.runId !== runId,
  );
  next.push(
    ...entries.map((entry) => ({
      ...toPublicAttempt(entry),
      transport: "graphql" as const,
      runId,
    })),
  );
  saveLocal(next);
  emit();
  return true;
}

export async function acknowledgeGraphQLRun(runId: string): Promise<boolean> {
  if (!signedIn || !isUuid(runId)) return false;
  try {
    await fetchServer();
  } catch {
    serverUnavailable = true;
    emit();
    return false;
  }
  localAttempts ??= loadLocal();
  saveLocal(
    localAttempts.filter(
      (attempt) => attempt.transport !== "graphql" || attempt.runId !== runId,
    ),
  );
  emit();
  return true;
}

export function clearLocalAttempts(): void {
  saveLocal([]);
  emit();
}

export function useAttempts(): Attempt[] | null {
  return useSyncExternalStore(subscribe, attemptsView, () => null);
}

function toPublicAttempt(attempt: StoredAttempt): Attempt {
  return {
    taskId: attempt.taskId,
    slot: attempt.slot,
    correct: attempt.correct,
    source: attempt.source,
    helpLevel: attempt.helpLevel,
    at: attempt.at,
  };
}
