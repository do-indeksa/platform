"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CheckResult } from "@/lib/answer";
import {
  createTaskDraft,
  parseTaskDraft,
  taskDraftStorageKey,
  type TaskDraft,
} from "@/lib/task-draft";
import type { TaskSessionOwnerId } from "@/lib/task-session-owner";

export type TaskCheckState = TaskDraft & {
  results: CheckResult[] | null;
};

export function useTaskCheckState(
  taskId: string,
  partCount: number,
  maxHints: number,
  confirmMessage: string,
  practiceId: string | null,
  ownerId: TaskSessionOwnerId | undefined,
  preferredDraft?: TaskDraft | null,
): [TaskCheckState, Dispatch<SetStateAction<TaskCheckState>>, boolean] {
  const storageKey =
    ownerId === undefined
      ? null
      : taskDraftStorageKey(ownerId, taskId, practiceId);
  const restorationKey =
    storageKey === null
      ? null
      : `${storageKey}:${partCount}:${maxHints}:${preferredDraft === undefined ? "session" : "durable"}`;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const [state, setState] = useState<TaskCheckState>(() => ({
    ...createTaskDraft(partCount),
    results: null,
  }));
  const emptyState = useMemo<TaskCheckState>(
    () => ({ ...createTaskDraft(partCount), results: null }),
    [partCount],
  );
  const draftReady = restorationKey !== null && restoredKey === restorationKey;

  useEffect(() => {
    if (storageKey === null || restorationKey === null) {
      // Auth ownership is unresolved, so no persisted task state may be read.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ ...createTaskDraft(partCount), results: null });
      setRestoredKey(null);
      return;
    }
    if (restoredKey === restorationKey) return;
    const raw =
      preferredDraft === undefined
        ? readSession(storageKey)
        : JSON.stringify(preferredDraft ?? createTaskDraft(partCount));
    const draft = parseTaskDraft(raw, partCount, maxHints);
    // Session storage is external state and can only be restored after hydration.
    setState({ ...(draft ?? createTaskDraft(partCount)), results: null });
    setRestoredKey(restorationKey);
  }, [
    maxHints,
    partCount,
    preferredDraft,
    restorationKey,
    restoredKey,
    storageKey,
  ]);

  useEffect(() => {
    if (!draftReady || storageKey === null) return;
    writeSession(storageKey, toDraft(state));
  }, [draftReady, state, storageKey]);

  const visibleState = draftReady ? state : emptyState;
  useUnsavedExitGuard(draftReady && state.dirty, confirmMessage);
  return [visibleState, setState, draftReady];
}

function toDraft(state: TaskCheckState): TaskDraft {
  return {
    answers: state.answers,
    view: state.view,
    attempted: state.attempted,
    hintsShown: state.hintsShown,
    solved: state.solved,
    burned: state.burned,
    dirty: state.dirty,
    ...(state.activeDurationMs === undefined
      ? {}
      : { activeDurationMs: state.activeDurationMs }),
  };
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, draft: TaskDraft): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {}
}

function useUnsavedExitGuard(dirty: boolean, confirmMessage: string): void {
  useEffect(() => {
    if (!dirty) return;

    const confirmExit = () => window.confirm(confirmMessage);
    let restoringHistory = false;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = confirmMessage;
    };
    const documentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const anchor =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return;
      }
      if (!confirmExit()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const historyNavigation = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      if (!confirmExit()) {
        restoringHistory = true;
        window.history.forward();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", historyNavigation);
    document.addEventListener("click", documentClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", historyNavigation);
      document.removeEventListener("click", documentClick, true);
    };
  }, [confirmMessage, dirty]);
}
