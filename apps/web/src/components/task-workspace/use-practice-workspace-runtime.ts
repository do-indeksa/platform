"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LearningRunOwnerId } from "@/lib/learning-run-owner";
import { createPracticeActiveClock } from "@/lib/practice-active-clock";
import { usePracticeRuntime } from "@/lib/practice-runtime-store";
import { schedulePracticeRuntimeSync } from "@/lib/practice-runtime-sync-scheduler";
import {
  appendPracticeWorkspaceAttempt,
  changePracticeWorkspaceDraft,
  finishPracticeWorkspace,
  inspectPracticeWorkspace,
  visitPracticeWorkspace,
  type PracticeWorkspaceContext,
  type PracticeWorkspaceTaskStatus,
} from "@/lib/practice-workspace-runtime";
import { taskDraftFromPracticeWorkspace } from "@/lib/practice-workspace-draft";
import type { TaskDraft } from "@/lib/task-draft";
import { useHydrated } from "@/lib/use-hydrated";
import type { TaskWorkspaceItem } from "./types";

const ACTIVE_CHECKPOINT_INTERVAL_MS = 15_000;
const EMPTY_TASK_STATUSES: Readonly<
  Record<string, PracticeWorkspaceTaskStatus>
> = Object.freeze({});

type RuntimeStatus = "loading" | "legacy" | "bound" | "mismatch";

type RecordedAttempt = {
  startedAt: number;
  submittedAt: number;
  activeDurationMs: number;
  persistedInRun: boolean;
};

export function usePracticeWorkspaceRuntime({
  practiceId,
  runtimeRequired,
  ownerId,
  taskId,
  taskRevision,
  taskSlot,
  taskTopic,
  answerPartCount,
  maxHints,
  taskIndex,
  sequence,
}: {
  practiceId: string | null;
  runtimeRequired: boolean;
  ownerId: LearningRunOwnerId | undefined;
  taskId: string;
  taskRevision: string;
  taskSlot: number;
  taskTopic: string;
  answerPartCount: number;
  maxHints: number;
  taskIndex: number;
  sequence: readonly TaskWorkspaceItem[];
}) {
  const hydrated = useHydrated();
  const runtimeOwnerId = usePracticeRuntime((state) => state.authOwnerId);
  const ownerGeneration = usePracticeRuntime(
    (state) => state.authOwnerGeneration,
  );
  const runs = usePracticeRuntime((state) => state.runs);
  const context = useMemo<PracticeWorkspaceContext | null>(
    () =>
      practiceId === null || ownerId === undefined
        ? null
        : {
            runId: practiceId,
            ownerId,
            currentIndex: taskIndex,
            task: {
              id: taskId,
              revision: taskRevision,
              slot: taskSlot,
              topic: taskTopic,
              answerPartCount,
            },
            sequence: sequence.map((task) => ({
              id: task.id,
              revision: task.revision,
              slot: task.slot,
              topic: task.topic,
              answerPartCount: task.partCount,
            })),
          },
    [
      answerPartCount,
      ownerId,
      practiceId,
      sequence,
      taskId,
      taskIndex,
      taskRevision,
      taskSlot,
      taskTopic,
    ],
  );
  const inspection = useMemo(() => {
    void runs;
    if (!hydrated || ownerId === undefined || runtimeOwnerId === undefined) {
      return { status: "loading" as const, snapshot: null };
    }
    if (context === null) {
      return {
        status: runtimeRequired ? ("mismatch" as const) : ("legacy" as const),
        snapshot: null,
      };
    }
    const result = inspectPracticeWorkspace(context);
    if (result.status === "bound") return result;
    return {
      status:
        result.status === "missing" && !runtimeRequired
          ? ("legacy" as const)
          : ("mismatch" as const),
      snapshot: null,
    };
  }, [context, hydrated, ownerId, runs, runtimeOwnerId, runtimeRequired]);
  const status: RuntimeStatus = inspection.status;
  const snapshot = inspection.snapshot;
  const preferredDraft = useMemo<TaskDraft | null | undefined>(
    () =>
      status === "bound" && snapshot !== null
        ? taskDraftFromPracticeWorkspace(snapshot, maxHints)
        : undefined,
    [maxHints, snapshot, status],
  );
  const clockRef = useRef<{
    key: string;
    clock: ReturnType<typeof createPracticeActiveClock>;
  } | null>(null);
  const attemptRef = useRef<{
    startedAt: number;
    activeDurationMs: number;
  } | null>(null);
  const bindingKey =
    status === "bound" && context !== null
      ? `${ownerGeneration}:${context.ownerId ?? "guest"}:${context.runId}`
      : null;

  const activeDuration = useCallback(
    () => clockRef.current?.clock.read() ?? 0,
    [],
  );
  const scheduleSync = useCallback(
    (immediate: boolean) => {
      if (context !== null && typeof context.ownerId === "string") {
        schedulePracticeRuntimeSync(context.runId, context.ownerId, immediate);
      }
    },
    [context],
  );
  const visit = useCallback(() => {
    if (status !== "bound" || context === null) return false;
    const changed = visitPracticeWorkspace(context, activeDuration());
    if (changed) scheduleSync(false);
    return changed;
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
      activeDurationMs: initial.activeDurationMs,
    };
    visit();
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        clock.pause();
        visit();
      } else {
        clock.resume();
      }
    };
    const interval = window.setInterval(visit, ACTIVE_CHECKPOINT_INTERVAL_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clock.pause();
      visit();
      if (clockRef.current?.key === bindingKey) clockRef.current = null;
      attemptRef.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [bindingKey, context, status, visit]);

  useEffect(() => {
    if (status !== "legacy") return;
    attemptRef.current = { startedAt: Date.now(), activeDurationMs: 0 };
    return () => {
      attemptRef.current = null;
    };
  }, [ownerId, status, taskId]);

  const changeDraft = useCallback(
    (draft: Pick<TaskDraft, "answers" | "hintsShown">) => {
      if (status === "legacy") return true;
      if (status !== "bound" || context === null) return false;
      const changed = changePracticeWorkspaceDraft(context, {
        answers: draft.answers,
        helpLevel: draft.hintsShown,
        activeDurationMs: activeDuration(),
      });
      if (changed) scheduleSync(false);
      return changed;
    },
    [activeDuration, context, scheduleSync, status],
  );

  const recordAttempt = useCallback(
    (
      outcome: "correct" | "incorrect" | "skipped",
      answers: readonly string[],
      helpLevel: number,
    ): RecordedAttempt | null => {
      if (status !== "legacy" && status !== "bound") return null;
      const attempt = attemptRef.current;
      if (attempt === null) return null;
      const submittedAt = Math.max(Date.now(), attempt.startedAt);
      const runActiveDurationMs = activeDuration();
      if (
        status === "bound" &&
        (context === null ||
          appendPracticeWorkspaceAttempt(context, {
            startedAt: attempt.startedAt,
            submittedAt,
            activeDurationMs: Math.max(
              0,
              runActiveDurationMs - attempt.activeDurationMs,
            ),
            answers,
            outcome,
            helpLevel,
            runActiveDurationMs,
          }) === null)
      ) {
        return null;
      }
      attemptRef.current = {
        startedAt: submittedAt,
        activeDurationMs: runActiveDurationMs,
      };
      if (status === "bound") scheduleSync(true);
      return {
        startedAt: attempt.startedAt,
        submittedAt,
        activeDurationMs: Math.max(0, submittedAt - attempt.startedAt),
        persistedInRun: status === "bound",
      };
    },
    [activeDuration, context, scheduleSync, status],
  );

  const finish = useCallback(() => {
    if (status === "legacy") return true;
    if (status !== "bound" || context === null) return false;
    const current = inspectPracticeWorkspace(context);
    if (current.status !== "bound") return false;
    const clock = clockRef.current?.clock;
    const activeDurationMs =
      clock?.pause() ?? current.snapshot.activeDurationMs;
    const transition = finishPracticeWorkspace(context, {
      submittedAt: Math.max(Date.now(), current.snapshot.latestSubmittedAt),
      activeDurationMs,
    });
    if (transition === null) {
      if (clock !== undefined && document.visibilityState === "visible") {
        clock.resume();
      }
      return false;
    }
    if (transition !== "removed") scheduleSync(true);
    return true;
  }, [context, scheduleSync, status]);

  return {
    status,
    preferredDraft,
    taskStatuses:
      status === "bound" && snapshot !== null
        ? snapshot.taskStatuses
        : EMPTY_TASK_STATUSES,
    changeDraft,
    recordAttempt,
    finish,
  };
}
