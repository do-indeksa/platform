"use client";

import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import { fetchHistoryRuns } from "./history-run-client";
import type {
  HistoryRunSummary,
  SubmittedRunSummary,
} from "./history-run-summary";

export type HistoryRunSnapshot = {
  status: "guest" | "synced" | "degraded";
  entries: readonly HistoryRunSummary[];
  latestSubmittedDiagnostic: SubmittedRunSummary | null;
};

let authKnown = false;
let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let refreshGeneration = 0;
let serverEntries: HistoryRunSummary[] | null = null;
let serverLatestSubmittedDiagnostic: SubmittedRunSummary | null = null;
let serverUnavailable = false;
let snapshot: HistoryRunSnapshot | null = null;
const listeners = new Set<() => void>();

export function historyRunView(): HistoryRunSnapshot | null {
  if (!authKnown) return null;
  if (activeOwnerId === null || activeOwnerId === undefined) {
    snapshot ??= {
      status: "guest",
      entries: [],
      latestSubmittedDiagnostic: null,
    };
    return snapshot;
  }
  if (serverEntries === null && !serverUnavailable) return null;
  snapshot ??= {
    status: serverUnavailable ? "degraded" : "synced",
    entries: serverEntries ?? [],
    latestSubmittedDiagnostic: serverLatestSubmittedDiagnostic,
  };
  return snapshot;
}

export function prepareHistoryRuns(userId: string | null): void {
  activateOwner(userId);
}

export async function syncHistoryRuns(userId: string | null): Promise<boolean> {
  const ownerId = normalizeOwner(userId);
  if (!authKnown || activeOwnerId !== ownerId) activateOwner(ownerId);
  if (ownerId === null) return false;
  return refreshHistoryRuns(ownerId);
}

export async function refreshHistoryRuns(userId: string): Promise<boolean> {
  if (!isUuid(userId) || !authKnown || activeOwnerId !== userId) return false;
  const ownerGeneration = authGeneration;
  const refresh = ++refreshGeneration;

  try {
    const result = await fetchHistoryRuns();
    if (!isCurrentRefresh(userId, ownerGeneration, refresh)) return false;
    serverEntries = result.entries;
    serverLatestSubmittedDiagnostic = result.latestSubmittedDiagnostic;
    serverUnavailable = false;
  } catch {
    if (!isCurrentRefresh(userId, ownerGeneration, refresh)) return false;
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
  activeOwnerId = normalizeOwner(userId);
  serverEntries = null;
  serverLatestSubmittedDiagnostic = null;
  serverUnavailable = false;
  emit();
}

function normalizeOwner(userId: string | null): string | null {
  return userId === null || isUuid(userId) ? userId : null;
}

function isCurrentRefresh(
  userId: string,
  ownerGeneration: number,
  refresh: number,
): boolean {
  return (
    activeOwnerId === userId &&
    authGeneration === ownerGeneration &&
    refreshGeneration === refresh
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}
