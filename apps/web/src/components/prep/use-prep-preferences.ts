"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserStorageOwnerId } from "@/lib/browser-storage-owner";
import {
  EMPTY_PREP_PREFERENCES,
  prepSettingsStorageKey,
  type PrepPreferences,
} from "@/lib/prep-settings";
import {
  hydratePrepPreferences,
  savePrepPreferencesForOwner,
  type PrepPreferencesSaveResult,
  type PrepPreferencesSyncState,
} from "@/lib/prep-preferences-sync";

type PreferencesSnapshot = {
  hydrationKey: string | null;
  hydrationId: number;
  state: PrepPreferencesSyncState;
};

const EMPTY_SYNC_STATE: PrepPreferencesSyncState = {
  preferences: { ...EMPTY_PREP_PREFERENCES },
  serverVersion: null,
  status: "degraded",
};

export function usePrepPreferences(ownerId: BrowserStorageOwnerId | undefined) {
  const hydrationKey =
    ownerId === undefined ? null : prepSettingsStorageKey(ownerId);
  const hydrationSequence = useRef(0);
  const activeHydration = useRef<{
    key: string;
    id: number;
    controller: AbortController;
  } | null>(null);
  const activeSave = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<PreferencesSnapshot>({
    hydrationKey: null,
    hydrationId: 0,
    state: EMPTY_SYNC_STATE,
  });
  const ready = hydrationKey !== null && snapshot.hydrationKey === hydrationKey;
  const preferences = ready
    ? snapshot.state.preferences
    : { ...EMPTY_PREP_PREFERENCES };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (ownerId === undefined || hydrationKey === null) {
        setSnapshot({
          hydrationKey: null,
          hydrationId: 0,
          state: EMPTY_SYNC_STATE,
        });
        return;
      }
      const hydrationId = ++hydrationSequence.current;
      const hydration = { key: hydrationKey, id: hydrationId, controller };
      activeHydration.current = hydration;
      void hydratePrepPreferences(ownerId, controller.signal)
        .then((state) => {
          if (activeHydration.current !== hydration) return;
          setSnapshot({ hydrationKey, hydrationId, state });
        })
        .catch(() => {
          if (activeHydration.current !== hydration) return;
          setSnapshot({
            hydrationKey,
            hydrationId,
            state: EMPTY_SYNC_STATE,
          });
        });
    });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      activeSave.current?.abort();
      activeSave.current = null;
      if (activeHydration.current?.controller === controller) {
        activeHydration.current = null;
      }
    };
  }, [hydrationKey, ownerId]);

  const setPreferences = useCallback(
    async (next: PrepPreferences): Promise<PrepPreferencesSaveResult> => {
      if (!ready || ownerId === undefined || hydrationKey === null) {
        return { status: "unavailable" };
      }
      activeSave.current?.abort();
      const controller = new AbortController();
      activeSave.current = controller;
      let result: PrepPreferencesSaveResult;
      try {
        result = await savePrepPreferencesForOwner(
          ownerId,
          snapshot.state.serverVersion,
          next,
          controller.signal,
        );
      } catch {
        return { status: "unavailable" };
      } finally {
        if (activeSave.current === controller) activeSave.current = null;
      }
      if (
        result.status !== "unavailable" &&
        activeHydration.current?.key === hydrationKey &&
        activeHydration.current.id === snapshot.hydrationId
      ) {
        setSnapshot((current) =>
          current.hydrationKey === hydrationKey
            ? { ...current, state: result.state }
            : current,
        );
      }
      return result;
    },
    [hydrationKey, ownerId, ready, snapshot.state.serverVersion],
  );

  return {
    preferences,
    ready,
    hydrationId: ready ? snapshot.hydrationId : null,
    status: ready ? snapshot.state.status : null,
    setPreferences,
  };
}
