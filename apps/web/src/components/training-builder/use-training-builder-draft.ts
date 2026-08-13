"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowserStorageOwnerId } from "@/lib/browser-storage-owner";
import {
  createDefaultTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "@/lib/training-builder";
import { trainingBuilderStorageKey } from "@/lib/training-builder-storage";
import {
  hydrateTrainingBuilderDraft,
  saveTrainingBuilderDraftForOwner,
  type TrainingBuilderDraftSyncState,
} from "@/lib/training-builder-draft-sync";

export type TrainingBuilderDraftStatus =
  "idle" | "restored" | "saving" | "saved" | "conflict" | "error";

type DraftSnapshot = {
  hydrationKey: string | null;
  hydrationId: number;
  state: TrainingBuilderDraftSyncState;
  status: TrainingBuilderDraftStatus;
};

export function useTrainingBuilderDraft(
  ownerId: BrowserStorageOwnerId | undefined,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
) {
  const initialDraft = useMemo(
    () => createDefaultTrainingBuilderDraft(positions, blueprintVersion),
    [blueprintVersion, positions],
  );
  const catalogKey = useMemo(
    () =>
      positions
        .map(({ number, availableCount }) => `${number}:${availableCount}`)
        .join(","),
    [positions],
  );
  const hydrationKey =
    ownerId === undefined
      ? null
      : `${trainingBuilderStorageKey(ownerId)}:${blueprintVersion}:${catalogKey}`;
  const hydrationSequence = useRef(0);
  const activeHydration = useRef<{
    key: string;
    id: number;
    controller: AbortController;
  } | null>(null);
  const activeSave = useRef<AbortController | null>(null);
  const [snapshot, setSnapshot] = useState<DraftSnapshot>({
    hydrationKey: null,
    hydrationId: 0,
    state: degradedState(initialDraft),
    status: "idle",
  });
  const ready = hydrationKey !== null && snapshot.hydrationKey === hydrationKey;
  const draft = ready ? snapshot.state.draft : initialDraft;
  const status = ready ? snapshot.status : "idle";
  const saving = status === "saving";

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (ownerId === undefined || hydrationKey === null) {
        setSnapshot({
          hydrationKey: null,
          hydrationId: 0,
          state: degradedState(initialDraft),
          status: "idle",
        });
        return;
      }
      const hydrationId = ++hydrationSequence.current;
      const hydration = { key: hydrationKey, id: hydrationId, controller };
      activeHydration.current = hydration;
      void hydrateTrainingBuilderDraft(
        ownerId,
        positions,
        blueprintVersion,
        controller.signal,
      )
        .then((state) => {
          if (activeHydration.current !== hydration) return;
          setSnapshot({
            hydrationKey,
            hydrationId,
            state,
            status: state.source === "saved" ? "restored" : "idle",
          });
        })
        .catch(() => {
          if (activeHydration.current !== hydration) return;
          setSnapshot({
            hydrationKey,
            hydrationId,
            state: degradedState(initialDraft),
            status: "error",
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
  }, [blueprintVersion, hydrationKey, initialDraft, ownerId, positions]);

  const commit = useCallback(
    (next: TrainingBuilderDraft) => {
      if (!ready || hydrationKey === null || activeSave.current !== null)
        return;
      setSnapshot((current) =>
        current.hydrationKey === hydrationKey
          ? {
              ...current,
              state: { ...current.state, draft: next },
              status: "idle",
            }
          : current,
      );
    },
    [hydrationKey, ready],
  );

  const save = useCallback(async () => {
    if (
      !ready ||
      ownerId === undefined ||
      hydrationKey === null ||
      activeSave.current !== null
    ) {
      return;
    }
    const hydration = activeHydration.current;
    if (
      hydration === null ||
      hydration.key !== hydrationKey ||
      hydration.id !== snapshot.hydrationId
    ) {
      return;
    }
    const controller = new AbortController();
    activeSave.current = controller;
    setSnapshot((current) =>
      current.hydrationKey === hydrationKey
        ? { ...current, status: "saving" }
        : current,
    );
    let result;
    try {
      result = await saveTrainingBuilderDraftForOwner(
        ownerId,
        snapshot.state.serverVersion,
        draft,
        positions,
        blueprintVersion,
        controller.signal,
      );
    } catch {
      result = { status: "unavailable" } as const;
    } finally {
      if (activeSave.current === controller) activeSave.current = null;
    }
    if (activeHydration.current !== hydration) return;
    setSnapshot((current) => {
      if (
        current.hydrationKey !== hydrationKey ||
        current.hydrationId !== hydration.id
      ) {
        return current;
      }
      if (result.status === "unavailable") {
        return { ...current, status: "error" };
      }
      return {
        ...current,
        state: result.state,
        status: result.status,
      };
    });
  }, [
    blueprintVersion,
    draft,
    hydrationKey,
    ownerId,
    positions,
    ready,
    snapshot.hydrationId,
    snapshot.state.serverVersion,
  ]);

  return {
    draft,
    status,
    syncStatus: ready ? snapshot.state.status : null,
    ready,
    saving,
    commit,
    save,
  };
}

function degradedState(
  draft: TrainingBuilderDraft,
): TrainingBuilderDraftSyncState {
  return {
    draft,
    serverVersion: null,
    status: "degraded",
    source: "default",
  };
}
