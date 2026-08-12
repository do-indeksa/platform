"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrowserStorageOwnerId } from "@/lib/browser-storage-owner";
import {
  createDefaultTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "@/lib/training-builder";
import {
  loadTrainingBuilderDraft,
  saveTrainingBuilderDraft,
  trainingBuilderStorageKey,
} from "@/lib/training-builder-storage";

export type TrainingBuilderDraftStatus =
  "idle" | "restored" | "saved" | "error";

type DraftSnapshot = {
  hydrationKey: string | null;
  draft: TrainingBuilderDraft;
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
  const hydrationKey =
    ownerId === undefined
      ? null
      : `${trainingBuilderStorageKey(ownerId)}:${blueprintVersion}`;
  const [snapshot, setSnapshot] = useState<DraftSnapshot>({
    hydrationKey: null,
    draft: initialDraft,
    status: "idle",
  });
  const ready = hydrationKey !== null && snapshot.hydrationKey === hydrationKey;
  const draft = ready ? snapshot.draft : initialDraft;
  const status = ready ? snapshot.status : "idle";

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (ownerId === undefined || hydrationKey === null) {
        setSnapshot({
          hydrationKey: null,
          draft: initialDraft,
          status: "idle",
        });
        return;
      }
      const restored = loadTrainingBuilderDraft(
        ownerId,
        positions,
        blueprintVersion,
      );
      setSnapshot({
        hydrationKey,
        draft: restored ?? initialDraft,
        status: restored ? "restored" : "idle",
      });
    });
    return () => window.clearTimeout(timeout);
  }, [blueprintVersion, hydrationKey, initialDraft, ownerId, positions]);

  const commit = useCallback(
    (next: TrainingBuilderDraft) => {
      if (!ready || hydrationKey === null) return;
      setSnapshot((current) =>
        current.hydrationKey === hydrationKey
          ? { ...current, draft: next, status: "idle" }
          : current,
      );
    },
    [hydrationKey, ready],
  );

  const save = useCallback(() => {
    if (!ready || ownerId === undefined || hydrationKey === null) return;
    const saved = saveTrainingBuilderDraft(
      ownerId,
      draft,
      positions,
      blueprintVersion,
    );
    setSnapshot((current) =>
      current.hydrationKey === hydrationKey
        ? { ...current, status: saved ? "saved" : "error" }
        : current,
    );
  }, [blueprintVersion, draft, hydrationKey, ownerId, positions, ready]);

  return { draft, status, ready, commit, save };
}
