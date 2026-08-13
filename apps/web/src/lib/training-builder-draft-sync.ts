import type { BrowserStorageOwnerId } from "./browser-storage-owner";
import {
  fetchServerTrainingBuilderDraft,
  saveServerTrainingBuilderDraft,
  TrainingBuilderDraftGraphQLError,
  type ServerTrainingBuilderDraft,
} from "./training-builder-draft-client";
import {
  clearTrainingBuilderDraft,
  loadTrainingBuilderDraft,
  saveTrainingBuilderDraft as saveLocalTrainingBuilderDraft,
} from "./training-builder-storage";
import {
  createDefaultTrainingBuilderDraft,
  parseTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "./training-builder";

export type TrainingBuilderDraftSyncState = {
  draft: TrainingBuilderDraft;
  serverVersion: number | null;
  status: "guest" | "synced" | "degraded";
  source: "default" | "saved";
};

export type TrainingBuilderDraftSaveResult =
  | { status: "saved"; state: TrainingBuilderDraftSyncState }
  | { status: "conflict"; state: TrainingBuilderDraftSyncState }
  | { status: "unavailable" };

export async function hydrateTrainingBuilderDraft(
  ownerId: BrowserStorageOwnerId,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
  signal?: AbortSignal,
): Promise<TrainingBuilderDraftSyncState> {
  const local = loadTrainingBuilderDraft(ownerId, positions, blueprintVersion);
  const fallback =
    local ?? createDefaultTrainingBuilderDraft(positions, blueprintVersion);
  if (ownerId === null) {
    return {
      draft: fallback,
      serverVersion: null,
      status: "guest",
      source: local === null ? "default" : "saved",
    };
  }

  try {
    const remote = await fetchServerTrainingBuilderDraft(signal);
    if (remote !== null) {
      return syncedState(ownerId, remote, positions, blueprintVersion, signal);
    }
    if (local === null) {
      return {
        draft: fallback,
        serverVersion: 0,
        status: "synced",
        source: "default",
      };
    }
    try {
      const seeded = await saveServerTrainingBuilderDraft(0, local, signal);
      if (!sameDraft(seeded.draft, local)) {
        throw new Error("training builder draft seed acknowledgement differs");
      }
      return syncedState(ownerId, seeded, positions, blueprintVersion, signal);
    } catch (error) {
      if (!isConflict(error)) throw error;
      const winner = await fetchServerTrainingBuilderDraft(signal);
      if (winner === null) throw error;
      return syncedState(ownerId, winner, positions, blueprintVersion, signal);
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      draft: fallback,
      serverVersion: null,
      status: "degraded",
      source: local === null ? "default" : "saved",
    };
  }
}

export async function saveTrainingBuilderDraftForOwner(
  ownerId: BrowserStorageOwnerId,
  serverVersion: number | null,
  value: TrainingBuilderDraft,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
  signal?: AbortSignal,
): Promise<TrainingBuilderDraftSaveResult> {
  const draft = parseTrainingBuilderDraft(value, positions, blueprintVersion);
  if (draft === null) return { status: "unavailable" };
  if (ownerId === null) {
    if (
      !saveLocalTrainingBuilderDraft(
        ownerId,
        draft,
        positions,
        blueprintVersion,
      )
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "saved",
      state: {
        draft,
        serverVersion: null,
        status: "guest",
        source: "saved",
      },
    };
  }

  try {
    let expectedVersion = serverVersion;
    if (expectedVersion === null) {
      const current = await fetchServerTrainingBuilderDraft(signal);
      if (current !== null) {
        const state = syncedState(
          ownerId,
          current,
          positions,
          blueprintVersion,
          signal,
        );
        return sameDraft(current.draft, draft)
          ? { status: "saved", state }
          : { status: "conflict", state };
      }
      expectedVersion = 0;
    }
    const saved = await saveServerTrainingBuilderDraft(
      expectedVersion,
      draft,
      signal,
    );
    if (!sameDraft(saved.draft, draft)) return { status: "unavailable" };
    return {
      status: "saved",
      state: syncedState(ownerId, saved, positions, blueprintVersion, signal),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (!isConflict(error)) return { status: "unavailable" };
    try {
      const current = await fetchServerTrainingBuilderDraft(signal);
      if (current === null) return { status: "unavailable" };
      const state = syncedState(
        ownerId,
        current,
        positions,
        blueprintVersion,
        signal,
      );
      return sameDraft(current.draft, draft)
        ? { status: "saved", state }
        : { status: "conflict", state };
    } catch (readError) {
      if (isAbortError(readError)) throw readError;
      return { status: "unavailable" };
    }
  }
}

function syncedState(
  ownerId: string,
  remote: ServerTrainingBuilderDraft,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
  signal?: AbortSignal,
): TrainingBuilderDraftSyncState {
  signal?.throwIfAborted();
  const draft = parseTrainingBuilderDraft(
    remote.draft,
    positions,
    blueprintVersion,
  );
  if (draft !== null) {
    if (
      !saveLocalTrainingBuilderDraft(
        ownerId,
        draft,
        positions,
        blueprintVersion,
      )
    ) {
      clearTrainingBuilderDraft(ownerId);
    }
  } else {
    clearTrainingBuilderDraft(ownerId);
  }
  return {
    draft:
      draft ?? createDefaultTrainingBuilderDraft(positions, blueprintVersion),
    serverVersion: remote.serverVersion,
    status: "synced",
    source: draft === null ? "default" : "saved",
  };
}

function sameDraft(
  left: TrainingBuilderDraft,
  right: TrainingBuilderDraft,
): boolean {
  if (
    left.version !== right.version ||
    left.blueprintVersion !== right.blueprintVersion ||
    left.difficulty !== right.difficulty ||
    left.onlyNew !== right.onlyNew ||
    left.shuffle !== right.shuffle ||
    left.prioritizeMistakes !== right.prioritizeMistakes
  ) {
    return false;
  }
  const leftEntries = Object.entries(left.quantities).toSorted(
    ([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey),
  );
  const rightEntries = Object.entries(right.quantities).toSorted(
    ([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey),
  );
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([position, quantity], index) =>
        position === rightEntries[index]?.[0] &&
        quantity === rightEntries[index]?.[1],
    )
  );
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof TrainingBuilderDraftGraphQLError &&
    error.code === "CONFLICT"
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
