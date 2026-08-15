import {
  PrepPreferencesGraphQLError,
  fetchServerPrepPreferences,
  saveServerPrepPreferences,
  type SaveServerPrepPreferencesInput,
  type ServerPrepPreferences,
} from "./prep-preferences-client";
import {
  completePrepPreferences,
  parsePrepPreferences,
  type CompletePrepPreferences,
  type PrepPreferences,
} from "./prep-settings";

export type PrepPreferencesRemote = {
  fetch: (signal?: AbortSignal) => Promise<ServerPrepPreferences | null>;
  save: (
    input: SaveServerPrepPreferencesInput,
    signal?: AbortSignal,
  ) => Promise<ServerPrepPreferences>;
};

export type PrepPreferencesSyncResult = {
  preferences: PrepPreferences;
  version: number | null;
  authoritative: boolean;
};

export const serverPrepPreferencesRemote: PrepPreferencesRemote = {
  fetch: fetchServerPrepPreferences,
  save: saveServerPrepPreferences,
};

export async function hydrateSignedInPrepPreferences(
  local: PrepPreferences | null,
  remote: PrepPreferencesRemote = serverPrepPreferencesRemote,
  signal?: AbortSignal,
): Promise<PrepPreferencesSyncResult> {
  const fallback = parsePrepPreferences(local);
  let stored: ServerPrepPreferences | null;
  try {
    stored = await remote.fetch(signal);
  } catch (error) {
    rethrowAbort(error);
    return degraded(fallback);
  }
  if (stored !== null) return authoritative(stored);

  const seed = completePrepPreferences(fallback);
  if (seed === null) {
    return authoritativeEmpty();
  }
  try {
    return authoritative(
      await remote.save({ expectedVersion: 0, ...seed }, signal),
    );
  } catch (error) {
    rethrowAbort(error);
    if (!isConflict(error)) return degraded(fallback);
  }

  try {
    const winner = await remote.fetch(signal);
    return winner === null ? degraded(fallback) : authoritative(winner);
  } catch (error) {
    rethrowAbort(error);
    return degraded(fallback);
  }
}

export async function syncSignedInPrepPreferencesWrite(
  desired: CompletePrepPreferences,
  knownVersion: number | null,
  remote: PrepPreferencesRemote = serverPrepPreferencesRemote,
  signal?: AbortSignal,
): Promise<PrepPreferencesSyncResult> {
  const complete = completePrepPreferences(parsePrepPreferences(desired));
  if (
    complete === null ||
    (knownVersion !== null &&
      (!Number.isSafeInteger(knownVersion) || knownVersion < 0))
  ) {
    throw new Error("prep preferences sync input is invalid");
  }

  let expectedVersion = knownVersion;
  if (expectedVersion === null) {
    try {
      const stored = await remote.fetch(signal);
      if (stored !== null && samePreferences(stored, complete)) {
        return authoritative(stored);
      }
      expectedVersion = stored?.version ?? 0;
    } catch (error) {
      rethrowAbort(error);
      return degraded(complete);
    }
  }

  try {
    return authoritative(
      await remote.save({ expectedVersion, ...complete }, signal),
    );
  } catch (error) {
    rethrowAbort(error);
    if (!isConflict(error)) return degraded(complete);
  }

  try {
    const winner = await remote.fetch(signal);
    return winner === null ? degraded(complete) : authoritative(winner);
  } catch (error) {
    rethrowAbort(error);
    return degraded(complete);
  }
}

function authoritative(
  stored: ServerPrepPreferences,
): PrepPreferencesSyncResult {
  return {
    preferences: {
      goalPoints: stored.goalPoints,
      examDate: stored.examDate,
    },
    version: stored.version,
    authoritative: true,
  };
}

function authoritativeEmpty(): PrepPreferencesSyncResult {
  return {
    preferences: { goalPoints: null, examDate: null },
    version: 0,
    authoritative: true,
  };
}

function degraded(preferences: PrepPreferences): PrepPreferencesSyncResult {
  return { preferences, version: null, authoritative: false };
}

function samePreferences(
  left: CompletePrepPreferences,
  right: CompletePrepPreferences,
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

function rethrowAbort(error: unknown): void {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw error;
  }
}
