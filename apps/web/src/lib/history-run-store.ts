"use client";

import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import { fetchHistoryRuns } from "./history-run-client";
import type { HistoryRunSummary } from "./history-run-summary";

export type HistoryRunSnapshot = {
  status: "guest" | "synced" | "degraded";
  entries: readonly HistoryRunSummary[];
};

let authKnown = false;
let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let serverEntries: HistoryRunSummary[] | null = null;
let serverUnavailable = false;
let snapshot: HistoryRunSnapshot | null = null;
const listeners = new Set<() => void>();

export function historyRunView(): HistoryRunSnapshot | null {
  if (!authKnown) return null;
  if (activeOwnerId === null || activeOwnerId === undefined) {
    snapshot ??= { status: "guest", entries: [] };
    return snapshot;
  }
  if (serverEntries === null && !serverUnavailable) return null;
  snapshot ??= {
    status: serverUnavailable ? "degraded" : "synced",
    entries: serverEntries ?? [],
  };
  return snapshot;
}

export function prepareHistoryRuns(userId: string | null): void {
  activateOwner(userId);
}

export async function syncHistoryRuns(userId: string | null): Promise<void> {
  const { ownerId, generation } = activateOwner(userId);
  if (ownerId === null) return;

  try {
    const entries = await fetchHistoryRuns();
    if (!isCurrentOwner(ownerId, generation)) return;
    serverEntries = entries;
  } catch {
    if (!isCurrentOwner(ownerId, generation)) return;
    serverUnavailable = true;
  }
  emit();
}

export function useHistoryRuns(): HistoryRunSnapshot | null {
  return useSyncExternalStore(subscribe, historyRunView, () => null);
}

function activateOwner(userId: string | null): {
  ownerId: string | null;
  generation: number;
} {
  authKnown = true;
  const generation = ++authGeneration;
  const ownerId = userId === null || isUuid(userId) ? userId : null;
  activeOwnerId = ownerId;
  serverEntries = null;
  serverUnavailable = false;
  emit();
  return { ownerId, generation };
}

function isCurrentOwner(userId: string, generation: number): boolean {
  return activeOwnerId === userId && authGeneration === generation;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}
