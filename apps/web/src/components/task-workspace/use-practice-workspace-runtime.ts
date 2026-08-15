"use client";

import { useCallback, useMemo } from "react";
import type { LearningRunOwnerId } from "@/lib/learning-run-owner";
import { usePracticeRuntime } from "@/lib/practice-runtime-store";
import {
  appendPracticeWorkspaceAttempt,
  changePracticeWorkspaceDraft,
  finishPracticeWorkspace,
  inspectPracticeWorkspace,
  type PracticeWorkspaceContext,
  type PracticeWorkspaceTaskStatus,
} from "@/lib/practice-workspace-runtime";
import { taskDraftFromPracticeWorkspace } from "@/lib/practice-workspace-draft";
import type { TaskDraft } from "@/lib/task-draft";
import { useHydrated } from "@/lib/use-hydrated";
import type { TaskWorkspaceItem } from "./types";
import {
  usePracticeWorkspaceClock,
  type PracticeWorkspaceRuntimeStatus,
} from "./use-practice-workspace-clock";

const EMPTY_TASK_STATUSES: Readonly<
  Record<string, PracticeWorkspaceTaskStatus>
> = Object.freeze({});

type RecordedAttempt = {
  startedAt: number;
  submittedAt: number;
  activeDurationMs: number;
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
  const status: PracticeWorkspaceRuntimeStatus = inspection.status;
  const snapshot = inspection.snapshot;
  const preferredDraft = useMemo<TaskDraft | null | undefined>(
    () =>
      status === "bound" && snapshot !== null
        ? taskDraftFromPracticeWorkspace(snapshot, maxHints)
        : undefined,
    [maxHints, snapshot, status],
  );
  const {
    activeDuration,
    pauseActiveClock,
    resumeActiveClock,
    scheduleSync,
    prepareAttempt,
    commitAttempt,
  } = usePracticeWorkspaceClock({
    status,
    context,
    ownerGeneration,
    ownerId,
    taskId,
  });

  const changeDraft = useCallback(
    (draft: Pick<TaskDraft, "answers" | "hintsShown">) => {
      if (status === "legacy") return true;
      if (status !== "bound" || context === null) return false;
      const persisted = changePracticeWorkspaceDraft(context, {
        answers: draft.answers,
        helpLevel: draft.hintsShown,
        activeDurationMs: activeDuration(),
      });
      if (persisted) scheduleSync(false);
      return persisted;
    },
    [activeDuration, context, scheduleSync, status],
  );

  const recordAttempt = useCallback(
    (
      outcome: "correct" | "incorrect" | "skipped",
      answers: readonly string[],
      helpLevel: number,
    ): RecordedAttempt | null => {
      const timing = prepareAttempt();
      if (timing === null) return null;
      if (
        status === "bound" &&
        (context === null ||
          appendPracticeWorkspaceAttempt(context, {
            startedAt: timing.startedAt,
            submittedAt: timing.submittedAt,
            activeDurationMs: timing.activeDurationMs,
            answers,
            outcome,
            helpLevel,
            runActiveDurationMs: timing.runActiveDurationMs,
          }) === null)
      ) {
        return null;
      }
      commitAttempt(timing);
      if (status === "bound") scheduleSync(true);
      return {
        startedAt: timing.startedAt,
        submittedAt: timing.submittedAt,
        activeDurationMs: timing.activeDurationMs,
      };
    },
    [commitAttempt, context, prepareAttempt, scheduleSync, status],
  );

  const finish = useCallback(() => {
    if (status === "legacy") return true;
    if (status !== "bound" || context === null) return false;
    const current = inspectPracticeWorkspace(context);
    if (current.status !== "bound") return false;
    const activeDurationMs =
      pauseActiveClock() ?? current.snapshot.activeDurationMs;
    const transition = finishPracticeWorkspace(context, {
      submittedAt: Math.max(Date.now(), current.snapshot.latestSubmittedAt),
      activeDurationMs,
    });
    if (transition === null) {
      resumeActiveClock();
      return false;
    }
    if (transition !== "removed") scheduleSync(true);
    return true;
  }, [context, pauseActiveClock, resumeActiveClock, scheduleSync, status]);

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
