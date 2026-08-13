"use client";

import type { LearningRunOwnerId } from "./learning-run-owner";
import type { PracticeCloudAttempt } from "./practice-cloud-types";
import { usePracticeRuntime } from "./practice-runtime-store";
import type {
  PracticeRuntimeAttemptInput,
  PracticeRuntimeDraft,
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
  currentIndex: number;
  activeDurationMs: number;
  attempts: PracticeCloudAttempt[];
  draft: PracticeRuntimeDraft | null;
};

export function readPracticeWorkspace(
  context: PracticeWorkspaceContext,
): PracticeWorkspaceSnapshot | null {
  const binding = resolveBinding(context);
  if (binding === null) return null;
  return {
    startedAt: binding.run.startedAt,
    currentIndex: binding.run.currentIndex,
    activeDurationMs: binding.run.activeDurationMs,
    attempts: binding.item.attempts.map((attempt) => ({
      ...attempt,
      answers: [...attempt.answers],
    })),
    draft:
      binding.item.draft === null
        ? null
        : {
            ...binding.item.draft,
            answers: [...binding.item.draft.answers],
          },
  };
}

export function visitPracticeWorkspace(
  context: PracticeWorkspaceContext,
  activeDurationMs: number,
): boolean {
  if (resolveBinding(context) === null) return false;
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
  if (resolveBinding(context) === null) return false;
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
  if (resolveBinding(context) === null) return null;
  return usePracticeRuntime.getState().appendAttempt(context.runId, {
    ...input,
    taskId: context.task.id,
    currentIndex: context.currentIndex,
  });
}

function resolveBinding(context: PracticeWorkspaceContext) {
  const state = usePracticeRuntime.getState();
  if (state.authOwnerId !== context.ownerId) return null;
  const run = state.runs.find(
    (candidate) => candidate.assignment.runId === context.runId,
  );
  if (
    run === undefined ||
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
    return null;
  }
  const item = run.items[context.currentIndex];
  return item?.taskId === context.task.id ? { run, item } : null;
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
