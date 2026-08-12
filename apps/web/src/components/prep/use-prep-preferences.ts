"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserStorageOwnerId } from "@/lib/browser-storage-owner";
import {
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

export function usePrepPreferences(ownerId: BrowserStorageOwnerId | undefined) {
  const hydrationKey =
    ownerId === undefined ? null : prepSettingsStorageKey(ownerId);
  const hydrationSequence = useRef(0);
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
    const timeout = window.setTimeout(() => {
      if (ownerId === undefined || hydrationKey === null) {
        setSnapshot({
          hydrationKey: null,
          hydrationId: 0,
          preferences: { ...EMPTY_PREP_PREFERENCES },
        });
        return;
      }
      const restored = loadPrepPreferences(ownerId);
      hydrationSequence.current += 1;
      setSnapshot({
        hydrationKey,
        hydrationId: hydrationSequence.current,
        preferences: restored ?? { ...EMPTY_PREP_PREFERENCES },
      });
    });
    return () => window.clearTimeout(timeout);
  }, [hydrationKey, ownerId]);

  const setPreferences = useCallback(
    (next: PrepPreferences) => {
      if (!ready || ownerId === undefined || hydrationKey === null) return;
      const preferences = parsePrepPreferences(next);
      savePrepPreferences(ownerId, preferences);
      setSnapshot((current) =>
        current.hydrationKey === hydrationKey
          ? { ...current, preferences }
          : current,
      );
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
