import type { BrowserStorageOwnerId } from "./browser-storage-owner";
import {
  fetchServerPrepPreferences,
  PrepPreferencesGraphQLError,
  saveServerPrepPreferences,
  type ServerPrepPreferences,
} from "./prep-preferences-client";
import {
  EMPTY_PREP_PREFERENCES,
  loadPrepPreferences,
  parsePrepPreferences,
  savePrepPreferences,
  type PrepPreferences,
} from "./prep-settings";

export type PrepPreferencesSyncState = {
  preferences: PrepPreferences;
  serverVersion: number | null;
  status: "guest" | "synced" | "degraded";
};

export type PrepPreferencesSaveResult =
  | { status: "saved"; state: PrepPreferencesSyncState }
  | { status: "conflict"; state: PrepPreferencesSyncState }
  | { status: "unavailable" };

export async function hydratePrepPreferences(
  ownerId: BrowserStorageOwnerId,
  signal?: AbortSignal,
): Promise<PrepPreferencesSyncState> {
  const local = loadPrepPreferences(ownerId) ?? {
    ...EMPTY_PREP_PREFERENCES,
  };
  if (ownerId === null) {
    return { preferences: local, serverVersion: null, status: "guest" };
  }

  try {
    const remote = await fetchServerPrepPreferences(signal);
    if (remote !== null) return syncedState(ownerId, remote, signal);
    if (!isComplete(local)) {
      return {
        preferences: { ...EMPTY_PREP_PREFERENCES },
        serverVersion: 0,
        status: "synced",
      };
    }
    try {
      return syncedState(
        ownerId,
        await saveServerPrepPreferences(0, local, signal),
        signal,
      );
    } catch (error) {
      if (!isConflict(error)) throw error;
      const winner = await fetchServerPrepPreferences(signal);
      if (winner === null) throw error;
      return syncedState(ownerId, winner, signal);
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { preferences: local, serverVersion: null, status: "degraded" };
  }
}

export async function savePrepPreferencesForOwner(
  ownerId: BrowserStorageOwnerId,
  serverVersion: number | null,
  value: PrepPreferences,
  signal?: AbortSignal,
): Promise<PrepPreferencesSaveResult> {
  const preferences = parsePrepPreferences(value);
  if (!isComplete(preferences)) return { status: "unavailable" };
  if (ownerId === null) {
    if (!savePrepPreferences(ownerId, preferences)) {
      return { status: "unavailable" };
    }
    return {
      status: "saved",
      state: { preferences, serverVersion: null, status: "guest" },
    };
  }

  try {
    let expectedVersion = serverVersion;
    if (expectedVersion === null) {
      const current = await fetchServerPrepPreferences(signal);
      if (current !== null) {
        const state = syncedState(ownerId, current, signal);
        return samePreferences(current, preferences)
          ? { status: "saved", state }
          : { status: "conflict", state };
      }
      expectedVersion = 0;
    }
    const saved = await saveServerPrepPreferences(
      expectedVersion,
      preferences,
      signal,
    );
    return { status: "saved", state: syncedState(ownerId, saved, signal) };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (!isConflict(error)) return { status: "unavailable" };
    try {
      const current = await fetchServerPrepPreferences(signal);
      if (current === null) return { status: "unavailable" };
      const state = syncedState(ownerId, current, signal);
      return samePreferences(current, preferences)
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
  remote: ServerPrepPreferences,
  signal?: AbortSignal,
): PrepPreferencesSyncState {
  signal?.throwIfAborted();
  const preferences = {
    goalPoints: remote.goalPoints,
    examDate: remote.examDate,
  };
  savePrepPreferences(ownerId, preferences);
  return {
    preferences,
    serverVersion: remote.version,
    status: "synced",
  };
}

function isComplete(
  preferences: PrepPreferences,
): preferences is { goalPoints: number; examDate: string } {
  return preferences.goalPoints !== null && preferences.examDate !== null;
}

function samePreferences(
  left: PrepPreferences,
  right: PrepPreferences,
): boolean {
  return (
    left.goalPoints === right.goalPoints && left.examDate === right.examDate
  );
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof PrepPreferencesGraphQLError && error.code === "CONFLICT"
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
