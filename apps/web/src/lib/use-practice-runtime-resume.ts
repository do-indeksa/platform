"use client";

import { useEffect, useState } from "react";
import type { LearningRunOwnerId } from "./learning-run-owner";
import type { PracticeCloudCatalog } from "./practice-cloud-types";
import {
  selectPracticeRuntimeResume,
  type PracticeRuntimeResume,
} from "./practice-runtime-resume";
import { usePracticeRuntime } from "./practice-runtime-store";
import type { PersistedPracticeRun } from "./practice-runtime-types";

type ResolvedSelection = {
  ownerId: LearningRunOwnerId;
  runs: readonly PersistedPracticeRun[];
  catalog: PracticeCloudCatalog;
  resume: PracticeRuntimeResume | null;
};

export function usePracticeRuntimeResume(catalog: PracticeCloudCatalog): {
  ready: boolean;
  resume: PracticeRuntimeResume | null;
} {
  const ownerId = usePracticeRuntime((state) => state.authOwnerId);
  const runs = usePracticeRuntime((state) => state.runs);
  const [resolved, setResolved] = useState<ResolvedSelection | null>(null);

  useEffect(() => {
    if (ownerId === undefined) return;
    let current = true;
    void selectPracticeRuntimeResume(runs, ownerId, catalog).then(
      (resume) => {
        if (current) setResolved({ ownerId, runs, catalog, resume });
      },
      () => {
        if (current) setResolved({ ownerId, runs, catalog, resume: null });
      },
    );
    return () => {
      current = false;
    };
  }, [catalog, ownerId, runs]);

  const ready =
    ownerId !== undefined &&
    resolved?.ownerId === ownerId &&
    resolved.runs === runs &&
    resolved.catalog === catalog;
  return { ready, resume: ready ? resolved.resume : null };
}
