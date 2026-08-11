"use client";

import { useSyncExternalStore } from "react";
import { validate as isUuid } from "uuid";
import { fetchSimulationArchive } from "./simulation-archive-client";
import type { SimulationArchiveRun } from "./simulation-archive";

export type SimulationArchiveSnapshot = {
  status: "guest" | "synced" | "degraded";
  entries: readonly SimulationArchiveRun[];
};

let authKnown = false;
let activeOwnerId: string | null | undefined;
let authGeneration = 0;
let serverEntries: SimulationArchiveRun[] | null = null;
let serverUnavailable = false;
let snapshot: SimulationArchiveSnapshot | null = null;
const listeners = new Set<() => void>();

export function simulationArchiveView(): SimulationArchiveSnapshot | null {
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

export async function syncSimulationArchive(
  userId: string | null,
): Promise<void> {
  const { ownerId, generation } = activateOwner(userId);
  if (ownerId === null) return;

  try {
    const entries = await fetchSimulationArchive();
    if (!isCurrentOwner(ownerId, generation)) return;
    serverEntries = entries;
  } catch {
    if (!isCurrentOwner(ownerId, generation)) return;
    serverUnavailable = true;
  }
  emit();
}

export function prepareSimulationArchive(userId: string | null): void {
  activateOwner(userId);
}

export function useSimulationArchive(): SimulationArchiveSnapshot | null {
  return useSyncExternalStore(subscribe, simulationArchiveView, () => null);
}

function isCurrentOwner(userId: string, generation: number): boolean {
  return activeOwnerId === userId && authGeneration === generation;
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}
