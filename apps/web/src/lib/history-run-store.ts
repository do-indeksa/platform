"use client";

import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import { fetchHistoryRuns } from "./history-run-client";
import type { HistoryRunSummary } from "./history-run-summary";
import type { LatestSubmittedDiagnosticRun } from "./history-run-sync";

export type HistoryRunSnapshot = {
  status: "guest" | "synced" | "degraded";
  entries: readonly HistoryRunSummary[];
  latestSubmittedDiagnosticRun: LatestSubmittedDiagnosticRun | null;
};

export type HistoryRunSyncOptions = {
  signal?: AbortSignal;
  isCurrentOwner?: () => boolean;
};

let authKnown = false;
let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let serverEntries: HistoryRunSummary[] | null = null;
let latestSubmittedDiagnosticRun: LatestSubmittedDiagnosticRun | null = null;
let serverUnavailable = false;
let refreshSequence = 0;
let snapshot: HistoryRunSnapshot | null = null;
const listeners = new Set<() => void>();

export function historyRunView(): HistoryRunSnapshot | null {
  if (!authKnown) return null;
  if (activeOwnerId === null || activeOwnerId === undefined) {
    snapshot ??= {
      status: "guest",
      entries: [],
      latestSubmittedDiagnosticRun: null,
    };
    return snapshot;
  }
  if (serverEntries === null && !serverUnavailable) return null;
  snapshot ??= {
    status: serverUnavailable ? "degraded" : "synced",
    entries: serverEntries ?? [],
    latestSubmittedDiagnosticRun,
  };
  return snapshot;
}

export function prepareHistoryRuns(userId: string | null): void {
  activateOwner(userId);
}

export async function syncHistoryRuns(
  userId: string | null,
  options: HistoryRunSyncOptions = {},
): Promise<boolean> {
  if (userId === null) return authKnown && activeOwnerId === null;
  if (
    !isUuid(userId) ||
    activeOwnerId !== userId ||
    !isExternalOwnerCurrent(options)
  ) {
    return false;
  }
  const generation = authGeneration;
  const sequence = ++refreshSequence;

  try {
    const synced = await fetchHistoryRuns(options.signal);
    if (!isCurrentRefresh(userId, generation, sequence, options)) return false;
    serverEntries = synced.entries;
    latestSubmittedDiagnosticRun = synced.latestSubmittedDiagnosticRun;
    serverUnavailable = false;
  } catch {
    if (!isCurrentRefresh(userId, generation, sequence, options)) return false;
    serverUnavailable = true;
  }
  emit();
  return !serverUnavailable;
}

export function useHistoryRuns(): HistoryRunSnapshot | null {
  return useSyncExternalStore(subscribe, historyRunView, () => null);
}

function activateOwner(userId: string | null): void {
  authKnown = true;
  authGeneration += 1;
  refreshSequence += 1;
  const ownerId = userId === null || isUuid(userId) ? userId : null;
  activeOwnerId = ownerId;
  serverEntries = null;
  latestSubmittedDiagnosticRun = null;
  serverUnavailable = false;
  emit();
}

function isCurrentOwner(userId: string, generation: number): boolean {
  return activeOwnerId === userId && authGeneration === generation;
}

function isCurrentRefresh(
  userId: string,
  generation: number,
  sequence: number,
  options: HistoryRunSyncOptions,
): boolean {
  return (
    sequence === refreshSequence &&
    options.signal?.aborted !== true &&
    isCurrentOwner(userId, generation) &&
    isExternalOwnerCurrent(options)
  );
}

function isExternalOwnerCurrent(options: HistoryRunSyncOptions): boolean {
  return options.isCurrentOwner?.() !== false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}
