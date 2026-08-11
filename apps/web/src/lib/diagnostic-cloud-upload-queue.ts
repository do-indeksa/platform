"use client";

import {
  DiagnosticGraphQLError,
  uploadDiagnosticCloudRun,
  type DiagnosticCloudUpload,
} from "./diagnostic-cloud-client";
import {
  useDiagnostic,
  type PersistedDiagnosticState,
} from "./diagnostic-store";
import { withRunSyncLock } from "./run-sync-lock";

const DRAFT_DEBOUNCE_MS = 700;

type QueueContext = {
  ownerId: string;
  controller: AbortController;
};

type QueueCallbacks<Context extends QueueContext> = {
  isCurrent: (context: Context) => boolean;
  setStatus: (status: "syncing" | "offline") => void;
  setReady: (context: Context) => void;
  exposeConflict: (
    runId: string,
    context: Context,
    code: string,
  ) => Promise<boolean>;
};

type ScheduledUpload = {
  upload: DiagnosticCloudUpload;
  fingerprint: string;
  immediate: boolean;
};

type RunJob = {
  desired: ScheduledUpload | null;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  syncedFingerprint: string | null;
};

export class DiagnosticCloudUploadQueue<Context extends QueueContext> {
  private readonly jobs = new Map<string, RunJob>();
  private readonly blockedRuns = new Set<string>();

  constructor(private readonly callbacks: QueueCallbacks<Context>) {}

  schedule(
    upload: DiagnosticCloudUpload,
    state: PersistedDiagnosticState,
    context: Context,
    immediate: boolean,
  ): void {
    const runId = state.runId;
    if (
      state.phase !== "running" ||
      runId === null ||
      state.runOwnerId !== context.ownerId ||
      this.blockedRuns.has(runId)
    ) {
      return;
    }
    const fingerprint = uploadFingerprint(upload, state);
    const job = this.getJob(runId);
    if (
      job.syncedFingerprint === fingerprint ||
      job.desired?.fingerprint === fingerprint
    ) {
      return;
    }
    job.desired = {
      upload: { ...upload, state },
      fingerprint,
      immediate,
    };
    if (immediate) {
      clearJobTimer(job);
      void this.start(runId, context, job);
    } else if (!job.running) {
      this.delay(runId, context, job);
    }
  }

  finish(runId: string): void {
    this.blockedRuns.add(runId);
    const job = this.jobs.get(runId);
    if (!job) return;
    clearJobTimer(job);
    job.desired = null;
    if (!job.running) this.jobs.delete(runId);
  }

  pause(runId: string): void {
    this.blockedRuns.add(runId);
    const job = this.jobs.get(runId);
    if (job) clearJobTimer(job);
  }

  block(runId: string): void {
    this.blockedRuns.add(runId);
  }

  unblock(runId: string): void {
    this.blockedRuns.delete(runId);
  }

  delete(runId: string): void {
    const job = this.jobs.get(runId);
    if (job) clearJobTimer(job);
    this.jobs.delete(runId);
  }

  resume(runId: string, context: Context): void {
    const job = this.jobs.get(runId);
    if (job?.desired) {
      job.desired.immediate = true;
      void this.start(runId, context, job);
    }
  }

  retryAll(context: Context): void {
    for (const [runId, job] of this.jobs) {
      if (job.desired && !this.blockedRuns.has(runId)) {
        job.desired.immediate = true;
        void this.start(runId, context, job);
      }
    }
  }

  clear(): void {
    for (const job of this.jobs.values()) clearJobTimer(job);
    this.jobs.clear();
    this.blockedRuns.clear();
  }

  private async start(
    runId: string,
    context: Context,
    job: RunJob,
  ): Promise<void> {
    if (
      job.running ||
      job.desired === null ||
      !this.callbacks.isCurrent(context) ||
      this.blockedRuns.has(runId)
    ) {
      return;
    }
    clearJobTimer(job);
    const target = job.desired;
    job.desired = null;
    job.running = true;
    this.callbacks.setStatus("syncing");
    try {
      const version = await withRunSyncLock(runId, async () => {
        const current = useDiagnostic.getState();
        if (
          current.phase !== "running" ||
          current.runId !== runId ||
          !this.callbacks.isCurrent(context)
        ) {
          throw new DOMException("diagnostic changed", "AbortError");
        }
        return uploadDiagnosticCloudRun(
          {
            ...target.upload,
            state: {
              ...target.upload.state,
              checkpointVersion: current.checkpointVersion,
            },
          },
          () => this.callbacks.isCurrent(context),
          context.controller.signal,
        );
      });
      if (!this.callbacks.isCurrent(context) || this.blockedRuns.has(runId)) {
        return;
      }
      useDiagnostic.getState().adoptCheckpointVersion(runId, version);
      job.syncedFingerprint = target.fingerprint;
      this.callbacks.setReady(context);
    } catch (error) {
      if (!this.callbacks.isCurrent(context) || isAbortError(error)) return;
      if (
        error instanceof DiagnosticGraphQLError &&
        (error.code === "CONFLICT" ||
          error.code === "INVALID_STATE" ||
          error.code === "NOT_FOUND")
      ) {
        this.blockedRuns.add(runId);
        job.desired = null;
        const reconciled = await this.callbacks.exposeConflict(
          runId,
          context,
          error.code,
        );
        if (reconciled) {
          this.blockedRuns.delete(runId);
          job.desired = { ...target, immediate: true };
        }
      } else {
        job.desired = target;
        this.callbacks.setStatus("offline");
      }
    } finally {
      job.running = false;
      if (!this.callbacks.isCurrent(context) || this.blockedRuns.has(runId)) {
        if (job.desired === null) this.jobs.delete(runId);
        return;
      }
      if (job.desired !== null) {
        if (job.desired.immediate) {
          void this.start(runId, context, job);
        } else {
          this.delay(runId, context, job);
        }
      }
    }
  }

  private delay(runId: string, context: Context, job: RunJob): void {
    clearJobTimer(job);
    job.timer = setTimeout(() => {
      job.timer = null;
      void this.start(runId, context, job);
    }, DRAFT_DEBOUNCE_MS);
  }

  private getJob(runId: string): RunJob {
    const existing = this.jobs.get(runId);
    if (existing) return existing;
    const job: RunJob = {
      desired: null,
      timer: null,
      running: false,
      syncedFingerprint: null,
    };
    this.jobs.set(runId, job);
    return job;
  }
}

function uploadFingerprint(
  upload: DiagnosticCloudUpload,
  state: PersistedDiagnosticState,
): string {
  return JSON.stringify({
    runId: state.runId,
    taskIds: state.taskIds,
    slots: state.slots,
    answers: state.answers,
    outcomes: state.outcomes,
    completedAt: state.completedAt,
    currentIndex: state.currentIndex,
    startedAt: state.startedAt,
    blueprintVersion: upload.blueprintVersion,
    contentRevision: upload.contentRevision,
    taskRevisions: upload.tasks.map((task) => task.revision),
    taskPositions: upload.tasks.map((task) => task.examPosition),
    taskTopics: upload.tasks.map((task) => task.topic),
  });
}

function clearJobTimer(job: RunJob): void {
  if (job.timer !== null) clearTimeout(job.timer);
  job.timer = null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
