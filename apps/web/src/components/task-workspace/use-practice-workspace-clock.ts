"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LearningRunOwnerId } from "@/lib/learning-run-owner";
import {
  createPracticeAttemptTiming,
  type PracticeAttemptCursor,
  type PracticeAttemptTiming,
} from "@/lib/practice-attempt-timing";
import { createPracticeActiveClock } from "@/lib/practice-active-clock";
import { schedulePracticeRuntimeSync } from "@/lib/practice-runtime-sync-scheduler";
import {
  inspectPracticeWorkspace,
  visitPracticeWorkspace,
  type PracticeWorkspaceContext,
} from "@/lib/practice-workspace-runtime";

const ACTIVE_CHECKPOINT_INTERVAL_MS = 15_000;

export type PracticeWorkspaceRuntimeStatus =
  "loading" | "legacy" | "bound" | "mismatch";

export function usePracticeWorkspaceClock({
  status,
  context,
  ownerGeneration,
  ownerId,
  taskId,
}: {
  status: PracticeWorkspaceRuntimeStatus;
  context: PracticeWorkspaceContext | null;
  ownerGeneration: number;
  ownerId: LearningRunOwnerId | undefined;
  taskId: string;
}) {
  const clockRef = useRef<{
    key: string;
    clock: ReturnType<typeof createPracticeActiveClock>;
  } | null>(null);
  const attemptRef = useRef<PracticeAttemptCursor | null>(null);
  const bindingKey =
    status === "bound" && context !== null
      ? [
          ownerGeneration,
          context.ownerId ?? "guest",
          context.runId,
          context.currentIndex,
          context.task.id,
        ].join(":")
      : null;

  const activeDuration = useCallback(
    () => clockRef.current?.clock.read() ?? 0,
    [],
  );
  const pauseActiveClock = useCallback(
    () => clockRef.current?.clock.pause() ?? null,
    [],
  );
  const resumeActiveClock = useCallback(() => {
    if (document.visibilityState === "visible") {
      clockRef.current?.clock.resume();
    }
  }, []);
  const scheduleSync = useCallback(
    (immediate: boolean) => {
      if (context !== null && typeof context.ownerId === "string") {
        schedulePracticeRuntimeSync(context.runId, context.ownerId, immediate);
      }
    },
    [context],
  );
  const checkpoint = useCallback(() => {
    if (status !== "bound" || context === null) return false;
    const persisted = visitPracticeWorkspace(context, activeDuration());
    if (persisted) scheduleSync(false);
    return persisted;
  }, [activeDuration, context, scheduleSync, status]);

  useEffect(() => {
    if (status !== "bound" || context === null || bindingKey === null) return;
    const current = inspectPracticeWorkspace(context);
    if (current.status !== "bound") return;
    const initial = current.snapshot;
    const clock = createPracticeActiveClock(
      initial.activeDurationMs,
      document.visibilityState === "visible",
    );
    clockRef.current = { key: bindingKey, clock };
    attemptRef.current = {
      startedAt: Math.max(Date.now(), initial.latestSubmittedAt),
      runActiveDurationMs: initial.activeDurationMs,
    };
    checkpoint();

    const updateVisibility = () => {
      if (document.visibilityState === "hidden") {
        clock.pause();
        checkpoint();
      } else {
        clock.resume();
      }
    };
    const interval = window.setInterval(
      checkpoint,
      ACTIVE_CHECKPOINT_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      clock.pause();
      checkpoint();
      if (clockRef.current?.key === bindingKey) clockRef.current = null;
      attemptRef.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, [bindingKey, checkpoint, context, status]);

  useEffect(() => {
    if (status !== "legacy") return;
    attemptRef.current = { startedAt: Date.now(), runActiveDurationMs: 0 };
    return () => {
      attemptRef.current = null;
    };
  }, [ownerId, status, taskId]);

  const prepareAttempt = useCallback((): PracticeAttemptTiming | null => {
    if (status !== "legacy" && status !== "bound") return null;
    const cursor = attemptRef.current;
    if (cursor === null) return null;
    return createPracticeAttemptTiming(
      cursor,
      Date.now(),
      activeDuration(),
      status === "bound" ? "active" : "wall",
    );
  }, [activeDuration, status]);
  const commitAttempt = useCallback((timing: PracticeAttemptTiming) => {
    attemptRef.current = {
      startedAt: timing.submittedAt,
      runActiveDurationMs: timing.runActiveDurationMs,
    };
  }, []);

  return {
    activeDuration,
    pauseActiveClock,
    resumeActiveClock,
    scheduleSync,
    prepareAttempt,
    commitAttempt,
  };
}
