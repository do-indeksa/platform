"use client";

import type { LearningRunOwnerId } from "./learning-run-owner";
import type { PracticeCloudAttempt } from "./practice-cloud-types";
import { usePracticeRuntime } from "./practice-runtime-store";
import type {
  PersistedPracticeRun,
  PracticeRuntimeAttemptInput,
  PracticeRuntimeDraft,
  PracticeRuntimeItem,
} from "./practice-runtime-types";

export type PracticeWorkspaceTask = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  answerPartCount: number;
};

export type PracticeWorkspaceContext = {
  runId: string;
  ownerId: LearningRunOwnerId;
  currentIndex: number;
  task: PracticeWorkspaceTask;
  sequence: readonly PracticeWorkspaceTask[];
};

export type PracticeWorkspaceSnapshot = {
  startedAt: number;
  latestSubmittedAt: number;
  currentIndex: number;
  activeDurationMs: number;
  attempts: PracticeCloudAttempt[];
  draft: PracticeRuntimeDraft | null;
};

export type PracticeWorkspaceInspection =
  | { status: "bound"; snapshot: PracticeWorkspaceSnapshot }
  | { status: "missing" | "mismatch" };

type PracticeWorkspaceBinding =
  | {
      status: "bound";
      run: PersistedPracticeRun;
      item: PracticeRuntimeItem;
    }
  | { status: "missing" | "mismatch" };

export function inspectPracticeWorkspace(
  context: PracticeWorkspaceContext,
): PracticeWorkspaceInspection {
  const binding = inspectBinding(context);
  return binding.status === "bound"
    ? { status: "bound", snapshot: snapshot(binding.run, binding.item) }
    : binding;
}

export function readPracticeWorkspace(
  context: PracticeWorkspaceContext,
): PracticeWorkspaceSnapshot | null {
  const inspection = inspectPracticeWorkspace(context);
  return inspection.status === "bound" ? inspection.snapshot : null;
}

export function visitPracticeWorkspace(
  context: PracticeWorkspaceContext,
  activeDurationMs: number,
): boolean {
  if (inspectBinding(context).status !== "bound") return false;
  return usePracticeRuntime.getState().visit(context.runId, {
    currentIndex: context.currentIndex,
    activeDurationMs,
  });
}

export function changePracticeWorkspaceDraft(
  context: PracticeWorkspaceContext,
  input: {
    answers: readonly string[];
    helpLevel: number;
    activeDurationMs: number;
  },
): boolean {
  if (inspectBinding(context).status !== "bound") return false;
  return usePracticeRuntime.getState().changeDraft(context.runId, {
    taskId: context.task.id,
    answers: input.answers,
    helpLevel: input.helpLevel,
    currentIndex: context.currentIndex,
    activeDurationMs: input.activeDurationMs,
  });
}

export function appendPracticeWorkspaceAttempt(
  context: PracticeWorkspaceContext,
  input: Omit<
    PracticeRuntimeAttemptInput,
    "taskId" | "currentIndex" | "runActiveDurationMs"
  > & { runActiveDurationMs: number },
): string | null {
  if (inspectBinding(context).status !== "bound") return null;
  return usePracticeRuntime.getState().appendAttempt(context.runId, {
    ...input,
    taskId: context.task.id,
    currentIndex: context.currentIndex,
  });
}

function inspectBinding(
  context: PracticeWorkspaceContext,
): PracticeWorkspaceBinding {
  const state = usePracticeRuntime.getState();
  if (state.authOwnerId !== context.ownerId) {
    return { status: "mismatch" as const };
  }
  const run = state.runs.find(
    (candidate) => candidate.assignment.runId === context.runId,
  );
  if (run === undefined) return { status: "missing" as const };
  if (
    run.phase !== "active" ||
    run.runOwnerId !== context.ownerId ||
    context.currentIndex < 0 ||
    context.currentIndex >= context.sequence.length ||
    !sameTask(context.task, context.sequence[context.currentIndex]) ||
    run.assignment.tasks.length !== context.sequence.length ||
    !run.assignment.tasks.every((task, index) =>
      sameTask(task, context.sequence[index]),
    )
  ) {
    return { status: "mismatch" as const };
  }
  const item = run.items[context.currentIndex];
  return item?.taskId === context.task.id
    ? { status: "bound" as const, run, item }
    : { status: "mismatch" as const };
}

function snapshot(
  run: PersistedPracticeRun,
  item: PracticeRuntimeItem,
): PracticeWorkspaceSnapshot {
  return {
    startedAt: run.startedAt,
    latestSubmittedAt: run.items
      .flatMap((candidate) => candidate.attempts)
      .reduce(
        (latest, attempt) => Math.max(latest, attempt.submittedAt),
        run.startedAt,
      ),
    currentIndex: run.currentIndex,
    activeDurationMs: run.activeDurationMs,
    attempts: item.attempts.map((attempt) => ({
      ...attempt,
      answers: [...attempt.answers],
    })),
    draft:
      item.draft === null
        ? null
        : { ...item.draft, answers: [...item.draft.answers] },
  };
}

function sameTask(
  left: PracticeWorkspaceTask | undefined,
  right: PracticeWorkspaceTask | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.id === right.id &&
    left.revision === right.revision &&
    left.slot === right.slot &&
    left.topic === right.topic &&
    left.answerPartCount === right.answerPartCount
  );
}
