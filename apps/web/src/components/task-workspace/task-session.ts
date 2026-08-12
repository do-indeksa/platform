"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseTaskDraft,
  taskDraftStorageKey,
  type TaskDraft,
} from "../../lib/task-draft";
import {
  taskSessionStorageScope,
  type TaskSessionOwnerId,
} from "../../lib/task-session-owner";
import type { TaskWorkspaceItem, TaskWorkspaceStatus } from "./types";

const CLOCK_STORAGE_PREFIX = "do-indeksa-practice-clock-v2:";
const MAX_CLOCK_AGE_MS = 12 * 60 * 60 * 1_000;

export function readTaskWorkspaceStatus(
  ownerId: TaskSessionOwnerId,
  task: TaskWorkspaceItem,
  practiceId: string | null,
): TaskWorkspaceStatus {
  try {
    const raw = sessionStorage.getItem(
      taskDraftStorageKey(ownerId, task.id, practiceId),
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

export function writeTaskDraftSession(
  ownerId: TaskSessionOwnerId,
  taskId: string,
  practiceId: string | null,
  draft: TaskDraft,
): void {
  writeSession(
    taskDraftStorageKey(ownerId, taskId, practiceId),
    JSON.stringify(draft),
  );
}

export function useStoredTaskStatuses(
  tasks: readonly TaskWorkspaceItem[],
  practiceId: string | null,
  refreshToken: string,
  ownerId: TaskSessionOwnerId | undefined,
): Readonly<Record<string, TaskWorkspaceStatus>> {
  const sessionKey =
    ownerId === undefined
      ? null
      : [
          taskSessionStorageScope(ownerId),
          practiceId ?? "standalone",
          ...tasks.map(
            (task) => `${task.id}/${task.partCount}/${task.maxHints}`,
          ),
        ].join(":");
  const [snapshot, setSnapshot] = useState<{
    sessionKey: string | null;
    statuses: Readonly<Record<string, TaskWorkspaceStatus>>;
  }>({ sessionKey: null, statuses: {} });

  useEffect(() => {
    if (ownerId === undefined || sessionKey === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot({ sessionKey: null, statuses: {} });
      return;
    }
    const next = Object.fromEntries(
      tasks.map((task) => [
        task.id,
        readTaskWorkspaceStatus(ownerId, task, practiceId),
      ]),
    );
    // Session storage is only available after hydration.
    setSnapshot({ sessionKey, statuses: next });
  }, [ownerId, practiceId, refreshToken, sessionKey, tasks]);

  return snapshot.sessionKey === sessionKey ? snapshot.statuses : {};
}

export function practiceClockStorageKey(
  ownerId: TaskSessionOwnerId,
  sessionId: string,
): string {
  return `${CLOCK_STORAGE_PREFIX}${taskSessionStorageScope(ownerId)}:${sessionId}`;
}

export function usePracticeElapsedSeconds(
  sessionId: string,
  ownerId: TaskSessionOwnerId | undefined,
): number {
  const storageKey = useMemo(
    () =>
      ownerId === undefined
        ? null
        : practiceClockStorageKey(ownerId, sessionId),
    [ownerId, sessionId],
  );
  const [clock, setClock] = useState<{
    storageKey: string | null;
    elapsed: number;
  }>({ storageKey: null, elapsed: 0 });

  useEffect(() => {
    if (storageKey === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClock({ storageKey: null, elapsed: 0 });
      return;
    }
    const now = Date.now();
    const startedAt = resolvePracticeStartedAt(readSession(storageKey), now);
    writeSession(storageKey, String(startedAt));

    const update = () => {
      setClock({
        storageKey,
        elapsed: Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)),
      });
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [storageKey]);

  return storageKey !== null && clock.storageKey === storageKey
    ? clock.elapsed
    : 0;
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

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}
