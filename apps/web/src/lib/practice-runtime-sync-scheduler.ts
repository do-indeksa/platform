"use client";

import { parseLearningRunOwner } from "./learning-run-owner";
import { syncPracticeRuntimeRun } from "./practice-runtime-sync";

const DRAFT_SYNC_DEBOUNCE_MS = 700;

type SyncJob = {
  ownerId: string;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
  immediate: boolean;
};

const jobs = new Map<string, SyncJob>();

export function schedulePracticeRuntimeSync(
  runId: string,
  ownerId: string,
  immediate = false,
): void {
  if (parseLearningRunOwner(ownerId) !== ownerId) return;
  let job = jobs.get(runId);
  if (job?.ownerId !== ownerId) {
    if (job?.timer !== null && job?.timer !== undefined) {
      clearTimeout(job.timer);
    }
    job = {
      ownerId,
      timer: null,
      running: false,
      pending: false,
      immediate: false,
    };
    jobs.set(runId, job);
  }
  job.pending = true;
  job.immediate ||= immediate;
  if (job.running) return;
  if (job.immediate) {
    void drain(runId, job);
  } else if (job.timer === null) {
    delay(runId, job);
  }
}

export function clearPracticeRuntimeSyncSchedule(): void {
  for (const job of jobs.values()) {
    if (job.timer !== null) clearTimeout(job.timer);
  }
  jobs.clear();
}

async function drain(runId: string, job: SyncJob): Promise<void> {
  if (jobs.get(runId) !== job || job.running || !job.pending) {
    return;
  }
  if (job.timer !== null) clearTimeout(job.timer);
  job.timer = null;
  job.pending = false;
  job.immediate = false;
  job.running = true;
  try {
    await syncPracticeRuntimeRun(runId, job.ownerId);
  } finally {
    job.running = false;
    if (jobs.get(runId) !== job) return;
    if (!job.pending) {
      jobs.delete(runId);
    } else if (job.immediate) {
      void drain(runId, job);
    } else {
      delay(runId, job);
    }
  }
}

function delay(runId: string, job: SyncJob): void {
  if (job.timer !== null) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    job.timer = null;
    void drain(runId, job);
  }, DRAFT_SYNC_DEBOUNCE_MS);
}
