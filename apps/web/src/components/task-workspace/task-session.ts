"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseTaskDraft,
  taskDraftStorageKey,
  type TaskDraft,
} from "../../lib/task-draft";
import type { TaskWorkspaceItem, TaskWorkspaceStatus } from "./types";

const CLOCK_STORAGE_PREFIX = "do-indeksa-practice-clock-v1:";
const MAX_CLOCK_AGE_MS = 12 * 60 * 60 * 1_000;

export function readTaskWorkspaceStatus(
  task: TaskWorkspaceItem,
  practiceId: string | null,
): TaskWorkspaceStatus {
  try {
    const raw = sessionStorage.getItem(
      taskDraftStorageKey(task.id, practiceId),
    );
    return parseTaskWorkspaceStatus(raw, task.partCount, task.maxHints);
  } catch {}
  return "pending";
}

export function parseTaskWorkspaceStatus(
  raw: string | null,
  partCount: number,
  maxHints: number,
): TaskWorkspaceStatus {
  const draft = parseTaskDraft(raw, partCount, maxHints);
  if (!draft) return "pending";
  if (draft.solved) return "solved";
  if (draft.burned) return "skipped";
  if (draft.attempted) return "retry";
  return "pending";
}

export function parseTaskWorkspaceDuration(
  raw: string | null,
  partCount: number,
  maxHints: number,
): number | null {
  return parseTaskDraft(raw, partCount, maxHints)?.activeDurationMs ?? null;
}

export function writeTaskDraftSession(
  taskId: string,
  practiceId: string | null,
  draft: TaskDraft,
): void {
  writeSession(taskDraftStorageKey(taskId, practiceId), JSON.stringify(draft));
}

export function useStoredTaskStatuses(
  tasks: readonly TaskWorkspaceItem[],
  practiceId: string | null,
  refreshToken: string,
): Readonly<Record<string, TaskWorkspaceStatus>> {
  const [statuses, setStatuses] = useState<
    Readonly<Record<string, TaskWorkspaceStatus>>
  >({});

  useEffect(() => {
    const next = Object.fromEntries(
      tasks.map((task) => [task.id, readTaskWorkspaceStatus(task, practiceId)]),
    );
    // Session storage is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatuses(next);
  }, [practiceId, refreshToken, tasks]);

  return statuses;
}

export function useStoredTaskDurations(
  tasks: readonly TaskWorkspaceItem[],
  practiceId: string | null,
  refreshToken: string,
): Readonly<Record<string, number>> {
  const [durations, setDurations] = useState<Readonly<Record<string, number>>>(
    {},
  );

  useEffect(() => {
    const next = Object.fromEntries(
      tasks.flatMap((task) => {
        const duration = readTaskWorkspaceDuration(task, practiceId);
        return duration === null ? [] : [[task.id, duration]];
      }),
    );
    // Session storage is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDurations(next);
  }, [practiceId, refreshToken, tasks]);

  return durations;
}

export function usePracticeElapsedSeconds(sessionId: string): number {
  const storageKey = useMemo(
    () => `${CLOCK_STORAGE_PREFIX}${sessionId}`,
    [sessionId],
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const startedAt = resolvePracticeStartedAt(readSession(storageKey), now);
    writeSession(storageKey, String(startedAt));

    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [storageKey]);

  return elapsed;
}

export function resolvePracticeStartedAt(
  storedValue: string | null,
  now: number,
): number {
  const parsed = storedValue === null ? Number.NaN : Number(storedValue);
  return Number.isFinite(parsed) &&
    parsed <= now &&
    now - parsed <= MAX_CLOCK_AGE_MS
    ? parsed
    : now;
}

export function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`;
  }
  return `${padTime(minutes)}:${padTime(seconds)}`;
}

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function readTaskWorkspaceDuration(
  task: TaskWorkspaceItem,
  practiceId: string | null,
): number | null {
  try {
    return parseTaskWorkspaceDuration(
      sessionStorage.getItem(taskDraftStorageKey(task.id, practiceId)),
      task.partCount,
      task.maxHints,
    );
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}
