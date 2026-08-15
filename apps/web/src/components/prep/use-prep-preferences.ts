"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserStorageOwnerId } from "@/lib/browser-storage-owner";
import {
  hydrateSignedInPrepPreferences,
  syncSignedInPrepPreferencesWrite,
} from "@/lib/prep-preferences-sync";
import {
  completePrepPreferences,
  EMPTY_PREP_PREFERENCES,
  loadPrepPreferences,
  parsePrepPreferences,
  prepSettingsStorageKey,
  savePrepPreferences,
  type PrepPreferences,
} from "@/lib/prep-settings";

type PreferencesSnapshot = {
  hydrationKey: string | null;
  hydrationId: number;
  preferences: PrepPreferences;
};

type PreferencesSyncContext = {
  hydrationKey: string;
  controller: AbortController;
  current: boolean;
  version: number | null;
  latestWrite: number;
  writeQueue: Promise<void>;
};

export function usePrepPreferences(ownerId: BrowserStorageOwnerId | undefined) {
  const hydrationKey =
    ownerId === undefined ? null : prepSettingsStorageKey(ownerId);
  const hydrationSequence = useRef(0);
  const syncContext = useRef<PreferencesSyncContext | null>(null);
  const [snapshot, setSnapshot] = useState<PreferencesSnapshot>({
    hydrationKey: null,
    hydrationId: 0,
    preferences: { ...EMPTY_PREP_PREFERENCES },
  });
  const ready = hydrationKey !== null && snapshot.hydrationKey === hydrationKey;
  const preferences = ready
    ? snapshot.preferences
    : { ...EMPTY_PREP_PREFERENCES };

  useEffect(() => {
    if (ownerId === undefined || hydrationKey === null) {
      syncContext.current = null;
      const timeout = window.setTimeout(() =>
        setSnapshot({
          hydrationKey: null,
          hydrationId: 0,
          preferences: { ...EMPTY_PREP_PREFERENCES },
        }),
      );
      return () => window.clearTimeout(timeout);
    }

    const context: PreferencesSyncContext = {
      hydrationKey,
      controller: new AbortController(),
      current: true,
      version: null,
      latestWrite: 0,
      writeQueue: Promise.resolve(),
    };
    syncContext.current = context;
    const timeout = window.setTimeout(() => {
      void hydratePreferences(ownerId, context)
        .then((result) => {
          if (!isCurrentContext(syncContext.current, context)) return;
          context.version = result.version;
          if (result.authoritative) {
            savePrepPreferences(ownerId, result.preferences);
          }
          hydrationSequence.current += 1;
          setSnapshot({
            hydrationKey,
            hydrationId: hydrationSequence.current,
            preferences: result.preferences,
          });
        })
        .catch(() => {});
    });

    return () => {
      window.clearTimeout(timeout);
      context.current = false;
      context.controller.abort();
      if (syncContext.current === context) syncContext.current = null;
    };
  }, [hydrationKey, ownerId]);

  const setPreferences = useCallback(
    (next: PrepPreferences) => {
      if (!ready || ownerId === undefined || hydrationKey === null) return;
      const parsed = parsePrepPreferences(next);
      const complete = completePrepPreferences(parsed);
      if (
        complete === null ||
        next.goalPoints !== complete.goalPoints ||
        next.examDate !== complete.examDate
      ) {
        return;
      }
      const context = syncContext.current;
      if (
        context === null ||
        !context.current ||
        context.hydrationKey !== hydrationKey
      ) {
        return;
      }

      savePrepPreferences(ownerId, complete);
      setSnapshot((current) =>
        current.hydrationKey === hydrationKey
          ? { ...current, preferences: complete }
          : current,
      );
      if (ownerId === null) return;

      context.latestWrite += 1;
      const writeSequence = context.latestWrite;
      context.writeQueue = context.writeQueue
        .then(async () => {
          if (!isCurrentContext(syncContext.current, context)) return;
          const result = await syncSignedInPrepPreferencesWrite(
            complete,
            context.version,
            undefined,
            context.controller.signal,
          );
          if (!isCurrentContext(syncContext.current, context)) return;
          context.version = result.version;
          if (writeSequence !== context.latestWrite) return;
          if (result.authoritative) {
            savePrepPreferences(ownerId, result.preferences);
          }
          setSnapshot((current) =>
            current.hydrationKey === hydrationKey
              ? { ...current, preferences: result.preferences }
              : current,
          );
        })
        .catch(() => {});
    },
    [hydrationKey, ownerId, ready],
  );

  return {
    preferences,
    ready,
    hydrationId: ready ? snapshot.hydrationId : null,
    setPreferences,
  };
}

async function hydratePreferences(
  ownerId: BrowserStorageOwnerId,
  context: PreferencesSyncContext,
) {
  const local = loadPrepPreferences(ownerId);
  if (ownerId === null) {
    return {
      preferences: local ?? { ...EMPTY_PREP_PREFERENCES },
      version: null,
      authoritative: false,
    };
  }
  return hydrateSignedInPrepPreferences(
    local,
    undefined,
    context.controller.signal,
  );
}

function isCurrentContext(
  current: PreferencesSyncContext | null,
  expected: PreferencesSyncContext,
): boolean {
  return current === expected && expected.current;
}
