import { useSyncExternalStore } from "react";
import type { Attempt, NewAttempt } from "@/lib/knowledge";

const STORAGE_KEY = "do-indeksa-attempts";

let localAttempts: Attempt[] | null = null;
let serverAttempts: Attempt[] | null = null;
let signedIn = false;
let view: Attempt[] | null = null;
const listeners = new Set<() => void>();

function loadLocal(): Attempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { attempts } = JSON.parse(raw) as { attempts?: Attempt[] };
    return attempts ?? [];
  } catch {
    return [];
  }
}

function saveLocal(attempts: Attempt[]): void {
  localAttempts = attempts;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, attempts }));
}

function snapshot(): Attempt[] | null {
  localAttempts ??= loadLocal();
  if (signedIn && serverAttempts === null) return null;
  view ??= signedIn
    ? [...(serverAttempts ?? []), ...localAttempts]
    : localAttempts;
  return view;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  view = null;
  for (const listener of listeners) listener();
}

async function flushLocal(): Promise<void> {
  localAttempts ??= loadLocal();
  if (localAttempts.length === 0) return;
  const res = await fetch("/api/v1/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(localAttempts),
  });
  if (res.ok) saveLocal([]);
}

async function fetchServer(): Promise<void> {
  const res = await fetch("/api/v1/attempts");
  if (res.ok) serverAttempts = (await res.json()) as Attempt[];
}

export async function syncAttempts(isSignedIn: boolean): Promise<void> {
  signedIn = isSignedIn;
  if (isSignedIn) {
    try {
      await flushLocal();
      await fetchServer();
    } catch {}
  } else {
    serverAttempts = null;
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
    void flushLocal()
      .then(() => fetchServer())
      .then(emit)
      .catch(() => {});
  }
}

export function useAttempts(): Attempt[] | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
