"use client";

import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import {
  isTaskHistoryEntry,
  parseTaskHistory,
  TASK_HISTORY_LIMIT,
  TASK_HISTORY_STORAGE_KEY,
  toPersistedTaskHistory,
  toPublicTaskHistoryEntry,
  type NewTaskHistoryEntry,
  type StoredTaskHistoryEntry,
  type TaskHistoryEntry,
} from "./task-history";

let cache: StoredTaskHistoryEntry[] | null = null;
let view: TaskHistoryEntry[] | null = null;
let authKnown = false;
let activeOwnerId: string | null | undefined;
const listeners = new Set<() => void>();

export function taskHistoryView(): TaskHistoryEntry[] | null {
  if (!authKnown) return null;
  cache ??= loadTaskHistory();
  view ??= cache
    .filter(({ ownerId }) => ownerId === (activeOwnerId ?? null))
    .map(toPublicTaskHistoryEntry);
  return view;
}

export function syncTaskHistory(userId: string | null): void {
  authKnown = true;
  const ownerId = userId === null || isUuid(userId) ? userId : null;
  activeOwnerId = ownerId;
  cache ??= loadTaskHistory();
  if (ownerId !== null) {
    const claimed = cache.map((entry) =>
      entry.ownerId === null ? { ...entry, ownerId } : entry,
    );
    if (claimed.some((entry, index) => entry !== cache?.[index])) {
      saveTaskHistory(claimed);
      return;
    }
  }
  emit();
}

export function recordTaskHistory(
  entries: readonly NewTaskHistoryEntry[],
): TaskHistoryEntry[] {
  const now = new Date().toISOString();
  const created = entries
    .map((entry): StoredTaskHistoryEntry => ({
      ...entry,
      answers: [...entry.answers],
      id: crypto.randomUUID(),
      at: entry.at ?? now,
      ownerId: activeOwnerId ?? null,
    }))
    .filter(isTaskHistoryEntry);
  if (created.length === 0) return [];

  cache ??= loadTaskHistory();
  saveTaskHistory([...created, ...cache].slice(0, TASK_HISTORY_LIMIT));
  return created.map(toPublicTaskHistoryEntry);
}

export function markTaskHistoryHelp(entryId: string, helpLevel: number): void {
  if (!Number.isInteger(helpLevel) || helpLevel < 0 || helpLevel > 3) return;
  cache ??= loadTaskHistory();
  const ownerId = activeOwnerId ?? null;
  const index = cache.findIndex(
    (entry) => entry.id === entryId && entry.ownerId === ownerId,
  );
  if (index < 0 || cache[index].helpLevel >= helpLevel) return;
  saveTaskHistory(cache.with(index, { ...cache[index], helpLevel }));
}

export function clearTaskHistory(): void {
  saveTaskHistory([]);
}

export function useTaskHistory(): TaskHistoryEntry[] | null {
  return useSyncExternalStore(subscribe, taskHistoryView, () => null);
}

function loadTaskHistory(): StoredTaskHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TASK_HISTORY_STORAGE_KEY);
    return raw ? parseTaskHistory(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function saveTaskHistory(entries: StoredTaskHistoryEntry[]): void {
  cache = entries;
  try {
    localStorage.setItem(
      TASK_HISTORY_STORAGE_KEY,
      JSON.stringify(toPersistedTaskHistory(entries)),
    );
  } catch {}
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", storageChanged);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", storageChanged);
    }
  };
}

function storageChanged(event: StorageEvent): void {
  if (event.key !== TASK_HISTORY_STORAGE_KEY) return;
  cache = null;
  emit();
}

function emit(): void {
  view = null;
  for (const listener of listeners) listener();
}
