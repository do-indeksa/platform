"use client";

import { parseLearningRunOwner } from "./learning-run-owner";
import { acknowledgePracticeRuntimeRun } from "./attempts-store";
import { refreshHistoryRuns } from "./history-run-store";
import { PracticeGraphQLError } from "./practice-cloud-client";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudRun,
} from "./practice-cloud-types";
import { withRunSyncLock } from "./run-sync-lock";
import {
  createPracticeAttemptFlight,
  createPracticeDraftFlight,
  practiceAttemptInput,
} from "./practice-runtime-flight";
import { nextPendingAttempt } from "./practice-runtime-model";
import { matchesPracticeCheckpointRecovery } from "./practice-runtime-recovery";
import { usePracticeRuntime } from "./practice-runtime-store";
import { defaultPracticeRuntimeTransport } from "./practice-runtime-transport";
import type { PersistedPracticeRun } from "./practice-runtime-types";
import type {
  PracticeRuntimeSyncEntry,
  PracticeRuntimeSyncOptions,
  PracticeRuntimeSyncResult,
  PracticeRuntimeSyncSummary,
  PracticeRuntimeTransport,
} from "./practice-runtime-sync-types";

type SyncContext = {
  ownerId: string;
  ownerGeneration: number;
  signal?: AbortSignal;
  transport: PracticeRuntimeTransport;
};

const TERMINAL_CONFLICT_CODES = new Set([
  "BAD_USER_INPUT",
  "CONFLICT",
  "INVALID_STATE",
  "NOT_FOUND",
  "UNAUTHENTICATED",
]);

export async function syncPracticeRuntimeRun(
  runId: string,
  ownerId: string,
  options: PracticeRuntimeSyncOptions = {},
): Promise<PracticeRuntimeSyncResult> {
  if (parseLearningRunOwner(ownerId) !== ownerId) {
    return { status: "aborted" };
  }
  const context: SyncContext = {
    ownerId,
    ownerGeneration: usePracticeRuntime.getState().authOwnerGeneration,
    signal: options.signal,
    transport: options.transport ?? defaultPracticeRuntimeTransport,
  };
  return withRunSyncLock(runId, () => drainPracticeRun(runId, context));
}

export async function syncPracticeRuntimeRuns(
  ownerId: string,
  options: PracticeRuntimeSyncOptions = {},
): Promise<PracticeRuntimeSyncSummary> {
  if (parseLearningRunOwner(ownerId) !== ownerId) {
    return { entries: [], status: "aborted" };
  }
  const runIds = usePracticeRuntime
    .getState()
    .runs.filter((run) => run.runOwnerId === ownerId)
    .map((run) => run.assignment.runId);
  const entries: PracticeRuntimeSyncEntry[] = [];
  for (const runId of runIds) {
    entries.push({
      runId,
      result: await syncPracticeRuntimeRun(runId, ownerId, options),
    });
  }
  return { entries, status: summarizeResults(entries) };
}

async function drainPracticeRun(
  runId: string,
  context: SyncContext,
): Promise<PracticeRuntimeSyncResult> {
  const initial = ownedRun(runId, context);
  if (initial === "aborted") return { status: "aborted" };
  if (initial === null) return { status: "missing" };
  const maxSteps =
    initial.items.length * MAX_PRACTICE_ATTEMPTS_PER_TASK * 3 + 16;

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      const current = ownedRun(runId, context);
      if (current === "aborted") return { status: "aborted" };
      if (current === null) return { status: "missing" };

      if (!current.startedRemotely) {
        try {
          await context.transport.start(
            current.assignment,
            current.startedAt,
            () => isCurrentContext(context),
            context.signal,
          );
        } catch (error) {
          if (
            !(error instanceof PracticeGraphQLError) ||
            error.code !== "CONFLICT"
          ) {
            throw error;
          }
          const remote = await context.transport.fetch(
            current.assignment,
            context.ownerId,
            context.signal,
          );
          if (
            !isCurrentContext(context) ||
            remote === null ||
            !matchesUnstartedPracticeRun(current, remote)
          ) {
            return { status: "conflict", code: "CONFLICT" };
          }
        }
        if (
          !isCurrentContext(context) ||
          !usePracticeRuntime.getState().markStartedRemotely(runId)
        ) {
          return { status: "aborted" };
        }
        continue;
      }

      if (current.checkpointFlight !== null) {
        const recovered = await drainCheckpointFlight(current, context);
        if (recovered !== null) return recovered;
        continue;
      }

      const pending = nextPendingAttempt(current);
      if (pending !== null) {
        const started = usePracticeRuntime
          .getState()
          .beginCheckpointFlight(
            runId,
            createPracticeAttemptFlight(current, pending),
          );
        if (!started) return { status: "conflict", code: "LOCAL_STATE" };
        continue;
      }

      if (current.checkpointDirty) {
        const started = usePracticeRuntime
          .getState()
          .beginCheckpointFlight(runId, createPracticeDraftFlight(current));
        if (!started) return { status: "conflict", code: "LOCAL_STATE" };
        continue;
      }

      if (current.phase === "submitting" && current.submission !== null) {
        await context.transport.submit(
          runId,
          current.submission.submittedAt,
          current.submission.activeDurationMs,
          () => isCurrentContext(context),
          context.signal,
        );
        if (!isCurrentContext(context)) return { status: "aborted" };
        if (!acknowledgePracticeRuntimeRun(context.ownerId, current)) {
          return { status: "conflict", code: "LOCAL_STATE" };
        }
        if (!usePracticeRuntime.getState().finishSubmission(runId)) {
          return { status: "aborted" };
        }
        void refreshHistoryRuns(context.ownerId);
        return { status: "synced" };
      }
      if (current.phase === "abandoning") {
        await context.transport.abandon(
          runId,
          () => isCurrentContext(context),
          context.signal,
        );
        if (!isCurrentContext(context)) return { status: "aborted" };
        return usePracticeRuntime.getState().finishAbandonment(runId)
          ? { status: "synced" }
          : { status: "aborted" };
      }
      return { status: "synced" };
    }
    return { status: "conflict", code: "LOCAL_STATE" };
  } catch (error) {
    return classifyFailure(error, context);
  }
}

function matchesUnstartedPracticeRun(
  local: PersistedPracticeRun,
  remote: PracticeCloudRun,
): boolean {
  return (
    !local.startedRemotely &&
    local.runOwnerId !== null &&
    remote.runId === local.assignment.runId &&
    remote.runOwnerId === local.runOwnerId &&
    remote.blueprintVersion === local.assignment.blueprintVersion &&
    remote.contentRevision === local.assignment.contentRevision &&
    remote.startedAt === local.startedAt &&
    remote.checkpointVersion === 0 &&
    remote.currentIndex === 0 &&
    remote.activeDurationMs === null &&
    remote.checkpointUpdatedAt === null &&
    remote.items.length === local.assignment.tasks.length &&
    remote.items.every((item, index) => {
      const task = local.assignment.tasks[index];
      return (
        task !== undefined &&
        item.task.id === task.id &&
        item.task.revision === task.revision &&
        item.task.slot === task.slot &&
        item.task.topic === task.topic &&
        item.task.answerPartCount === task.answerPartCount &&
        item.attempts.length === 0 &&
        item.draft === null
      );
    })
  );
}

async function drainCheckpointFlight(
  run: PersistedPracticeRun,
  context: SyncContext,
): Promise<PracticeRuntimeSyncResult | null> {
  const flight = run.checkpointFlight;
  if (flight === null) return null;
  if (flight.appliedVersion === null) {
    let version: number;
    try {
      version = await context.transport.checkpoint(
        run.assignment,
        {
          expectedVersion: flight.expectedVersion,
          currentIndex: flight.currentIndex,
          activeDurationMs: flight.activeDurationMs,
          drafts: flight.drafts,
        },
        () => isCurrentContext(context),
        context.signal,
      );
    } catch (error) {
      if (
        !(error instanceof PracticeGraphQLError) ||
        error.code !== "CONFLICT"
      ) {
        throw error;
      }
      return recoverCheckpointConflict(run, context);
    }
    if (
      !isCurrentContext(context) ||
      !usePracticeRuntime
        .getState()
        .markCheckpointApplied(run.assignment.runId, flight.id, version)
    ) {
      return { status: "aborted" };
    }
    return null;
  }

  if (flight.purpose === "draft") {
    return usePracticeRuntime
      .getState()
      .finishCheckpointFlight(run.assignment.runId, flight.id)
      ? null
      : { status: "conflict", code: "LOCAL_STATE" };
  }

  const pending = nextPendingAttempt(run);
  if (pending === null || pending.attempt.id !== flight.attemptId) {
    return { status: "conflict", code: "LOCAL_STATE" };
  }
  await context.transport.recordAttempt(
    run.assignment,
    practiceAttemptInput(pending),
    () => isCurrentContext(context),
    context.signal,
  );
  if (!isCurrentContext(context)) return { status: "aborted" };
  return usePracticeRuntime
    .getState()
    .markAttemptSynced(run.assignment.runId, pending.attempt.id)
    ? null
    : { status: "conflict", code: "LOCAL_STATE" };
}

async function recoverCheckpointConflict(
  run: PersistedPracticeRun,
  context: SyncContext,
): Promise<PracticeRuntimeSyncResult | null> {
  const flight = run.checkpointFlight;
  if (flight === null) return { status: "conflict", code: "LOCAL_STATE" };
  const remote = await context.transport.fetch(
    run.assignment,
    context.ownerId,
    context.signal,
  );
  if (!isCurrentContext(context)) return { status: "aborted" };
  if (remote === null || !matchesPracticeCheckpointRecovery(run, remote)) {
    return { status: "conflict", code: "CONFLICT" };
  }
  const store = usePracticeRuntime.getState();
  if (
    !store.markCheckpointApplied(
      run.assignment.runId,
      flight.id,
      flight.expectedVersion + 1,
    )
  ) {
    return { status: "conflict", code: "LOCAL_STATE" };
  }
  return null;
}

function ownedRun(
  runId: string,
  context: SyncContext,
): PersistedPracticeRun | "aborted" | null {
  if (!isCurrentContext(context)) return "aborted";
  const run = usePracticeRuntime
    .getState()
    .runs.find((candidate) => candidate.assignment.runId === runId);
  if (run === undefined) return null;
  return run.runOwnerId === context.ownerId ? run : "aborted";
}

function isCurrentContext(context: SyncContext): boolean {
  return (
    context.signal?.aborted !== true &&
    usePracticeRuntime.getState().authOwnerId === context.ownerId &&
    usePracticeRuntime.getState().authOwnerGeneration ===
      context.ownerGeneration
  );
}

function classifyFailure(
  error: unknown,
  context: SyncContext,
): PracticeRuntimeSyncResult {
  if (isAbortError(error) || !isCurrentContext(context)) {
    return { status: "aborted" };
  }
  if (
    error instanceof PracticeGraphQLError &&
    TERMINAL_CONFLICT_CODES.has(error.code)
  ) {
    return { status: "conflict", code: error.code };
  }
  return { status: "offline" };
}

function summarizeResults(
  entries: readonly PracticeRuntimeSyncEntry[],
): PracticeRuntimeSyncSummary["status"] {
  if (entries.some(({ result }) => result.status === "conflict")) {
    return "conflict";
  }
  if (entries.some(({ result }) => result.status === "offline")) {
    return "offline";
  }
  if (
    entries.some(
      ({ result }) =>
        result.status === "aborted" || result.status === "missing",
    )
  ) {
    return "aborted";
  }
  return "synced";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export type {
  PracticeRuntimeSyncEntry,
  PracticeRuntimeSyncOptions,
  PracticeRuntimeSyncResult,
  PracticeRuntimeSyncSummary,
  PracticeRuntimeTransport,
} from "./practice-runtime-sync-types";
