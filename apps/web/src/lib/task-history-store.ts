"use client";

import { useSyncExternalStore } from "react";
import {
  isTaskHistoryEntry,
  parseTaskHistory,
  TASK_HISTORY_LIMIT,
  TASK_HISTORY_STORAGE_KEY,
  toPersistedTaskHistory,
  type NewTaskHistoryEntry,
  type TaskHistoryEntry,
} from "./task-history";

let cache: TaskHistoryEntry[] | null = null;
const listeners = new Set<() => void>();

export function taskHistoryView(): TaskHistoryEntry[] {
  cache ??= loadTaskHistory();
  return cache;
}

export function recordTaskHistory(
  entries: readonly NewTaskHistoryEntry[],
): TaskHistoryEntry[] {
  const now = new Date().toISOString();
  const created = entries
    .map((entry): TaskHistoryEntry => ({
      ...entry,
      answers: [...entry.answers],
      id: crypto.randomUUID(),
      at: entry.at ?? now,
    }))
    .filter(isTaskHistoryEntry);
  if (created.length === 0) return [];

  saveTaskHistory(
    [...created, ...taskHistoryView()].slice(0, TASK_HISTORY_LIMIT),
  );
  return created.map((entry) => ({ ...entry, answers: [...entry.answers] }));
}

export function markTaskHistoryHelp(entryId: string, helpLevel: number): void {
  if (!Number.isInteger(helpLevel) || helpLevel < 0 || helpLevel > 3) return;
  const current = taskHistoryView();
  const index = current.findIndex((entry) => entry.id === entryId);
  if (index < 0 || current[index].helpLevel >= helpLevel) return;
  saveTaskHistory(current.with(index, { ...current[index], helpLevel }));
}

export function clearTaskHistory(): void {
  saveTaskHistory([]);
}

export function useTaskHistory(): TaskHistoryEntry[] | null {
  return useSyncExternalStore(subscribe, taskHistoryView, () => null);
}

function loadTaskHistory(): TaskHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TASK_HISTORY_STORAGE_KEY);
    return raw ? parseTaskHistory(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function saveTaskHistory(entries: TaskHistoryEntry[]): void {
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
  for (const listener of listeners) listener();
}
