import { useSyncExternalStore } from "react";
import type { Attempt, NewAttempt } from "@/lib/knowledge";

const STORAGE_KEY = "do-indeksa-attempts";
const MAX_BATCH = 500;
const MAX_TASK_ID = 64;
const TASK_ID_PATTERN = /^[a-z0-9-]+$/;
const SOURCES = new Set(["diagnostic", "practice", "simulation"]);

let localAttempts: Attempt[] | null = null;
let serverAttempts: Attempt[] | null = null;
let authKnown = false;
let signedIn = false;
let serverUnavailable = false;
let inFlightCount = 0;
let flushChain: Promise<void> = Promise.resolve();
let view: Attempt[] | null = null;
const listeners = new Set<() => void>();

function isAttempt(value: unknown): value is Attempt {
  if (typeof value !== "object" || value === null) return false;
  const attempt = value as Record<string, unknown>;
  return (
    typeof attempt.taskId === "string" &&
    attempt.taskId.length <= MAX_TASK_ID &&
    TASK_ID_PATTERN.test(attempt.taskId) &&
    typeof attempt.slot === "number" &&
    attempt.slot >= 1 &&
    attempt.slot <= 10 &&
    typeof attempt.correct === "boolean" &&
    typeof attempt.source === "string" &&
    SOURCES.has(attempt.source) &&
    typeof attempt.at === "string" &&
    !Number.isNaN(Date.parse(attempt.at))
  );
}

function loadLocal(): Attempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { attempts } = JSON.parse(raw) as { attempts?: unknown[] };
    return (attempts ?? []).filter(isAttempt);
  } catch {
    return [];
  }
}

function saveLocal(attempts: Attempt[]): void {
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
  const local = localAttempts ?? [];
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
  while (localAttempts.length > 0) {
    const chunk = localAttempts.slice(0, MAX_BATCH);
    inFlightCount = chunk.length;
    try {
      const res = await fetch("/api/v1/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok && res.status !== 400) {
        throw new Error(`flush failed with status ${res.status}`);
      }
      if (res.ok) {
        serverAttempts = [...(serverAttempts ?? []), ...chunk];
      }
      saveLocal(localAttempts.slice(chunk.length));
    } finally {
      inFlightCount = 0;
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
  const attempts = (await res.json()) as Attempt[];
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
  for (const entry of entries) {
    const last = next.at(-1);
    if (
      next.length > inFlightCount &&
      entry.source === "practice" &&
      last?.source === "practice" &&
      last.taskId === entry.taskId
    ) {
      next.pop();
    }
    next.push({ ...entry, at });
  }
  saveLocal(next);
  emit();
  if (signedIn) {
    void scheduleFlush()
      .then(fetchServer)
      .then(emit, () => emit());
  }
}

export function clearLocalAttempts(): void {
  saveLocal([]);
  emit();
}

export function useAttempts(): Attempt[] | null {
  return useSyncExternalStore(subscribe, attemptsView, () => null);
}
