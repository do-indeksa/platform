"use client";

import { useEffect, useMemo, useState } from "react";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import { projectPracticeCloudCatalog } from "@/lib/practice-cloud-catalog";
import { practiceRuntimeResumeHref } from "@/lib/practice-runtime-resume";
import type { ProgressCloudCatalog } from "@/lib/progress-cloud-types";
import { simulationRunHref } from "@/lib/simulation-run";
import {
  isSimulationActive,
  useSimulation,
  useSimulationOwnerKnown,
} from "@/lib/simulation-store";
import { useDiagnosticCloudBootstrap } from "@/lib/use-diagnostic-cloud";
import { useHydrated } from "@/lib/use-hydrated";
import { usePracticeRuntimeCloudBootstrap } from "@/lib/use-practice-runtime-cloud";
import { usePracticeRuntimeResume } from "@/lib/use-practice-runtime-resume";
import { useSimulationCloudBootstrap } from "@/lib/use-simulation-cloud";

export type CabinetResume =
  | {
      kind: "mock";
      href: string;
      current: number;
      total: number;
      answered: number;
      remainingMinutes: number;
    }
  | {
      kind: "diagnostic";
      href: string;
      current: number;
      total: number;
      answered: number;
    }
  | {
      kind: "practice";
      href: string;
      currentTaskId: string;
      currentPosition: number;
      current: number;
      total: number;
      completed: number;
    }
  | {
      kind: "diagnosticConflict" | "simulationConflict";
      href: "/diagnostic" | "/simulation";
    };

export function useCabinetResume(catalog: ProgressCloudCatalog): {
  ready: boolean;
  resume: CabinetResume | null;
} {
  const practiceCatalog = useMemo(
    () => projectPracticeCloudCatalog(catalog),
    [catalog],
  );
  const diagnosticCloud = useDiagnosticCloudBootstrap(catalog);
  const simulationCloud = useSimulationCloudBootstrap(catalog);
  const practiceCloud = usePracticeRuntimeCloudBootstrap(practiceCatalog);
  const practiceSelection = usePracticeRuntimeResume(practiceCatalog);
  const hydrated = useHydrated();
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const simulationOwnerKnown = useSimulationOwnerKnown();
  const [now, setNow] = useState(() => Date.now());

  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticRunId = useDiagnostic((state) => state.runId);
  const diagnosticTaskIds = useDiagnostic((state) => state.taskIds);
  const diagnosticIndex = useDiagnostic((state) => state.currentIndex);
  const diagnosticOutcomes = useDiagnostic((state) => state.outcomes);

  const simulationPhase = useSimulation((state) => state.phase);
  const simulationRunId = useSimulation((state) => state.runId);
  const simulationVersion = useSimulation((state) => state.blueprintVersion);
  const simulationTasks = useSimulation((state) => state.tasks);
  const simulationIndex = useSimulation((state) => state.currentIndex);
  const simulationAnswers = useSimulation((state) => state.answers);
  const simulationEndsAt = useSimulation((state) => state.endsAt);

  useEffect(() => {
    if (!isSimulationActive(simulationPhase)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [simulationPhase]);

  const ready =
    hydrated &&
    diagnosticOwnerKnown &&
    simulationOwnerKnown &&
    practiceSelection.ready &&
    !isCloudPending(diagnosticCloud.status) &&
    !isCloudPending(simulationCloud.status) &&
    !isCloudPending(practiceCloud.status);
  if (!ready) return { ready: false, resume: null };

  if (diagnosticCloud.status === "conflict") {
    return {
      ready: true,
      resume: { kind: "diagnosticConflict", href: "/diagnostic" },
    };
  }
  if (simulationCloud.status === "conflict") {
    return {
      ready: true,
      resume: { kind: "simulationConflict", href: "/simulation" },
    };
  }

  if (
    isSimulationActive(simulationPhase) &&
    simulationRunId !== null &&
    simulationVersion !== null &&
    simulationTasks.length > 0
  ) {
    return {
      ready: true,
      resume: {
        kind: "mock",
        href: simulationRunHref("/simulation/new", {
          runId: simulationRunId,
          blueprintVersion: simulationVersion,
          taskIds: simulationTasks.map(({ id }) => id),
        }),
        current: simulationIndex + 1,
        total: simulationTasks.length,
        answered: answeredCount(simulationAnswers),
        remainingMinutes: minutesRemaining(simulationEndsAt, now),
      },
    };
  }

  if (
    diagnosticPhase === "running" &&
    diagnosticRunId !== null &&
    diagnosticTaskIds.length > 0
  ) {
    return {
      ready: true,
      resume: {
        kind: "diagnostic",
        href: diagnosticRunHref(
          "/diagnostic/new",
          diagnosticRunId,
          diagnosticTaskIds,
        ),
        current: diagnosticIndex + 1,
        total: diagnosticTaskIds.length,
        answered: diagnosticOutcomes.filter(Boolean).length,
      },
    };
  }

  const remote = simulationCloud.remote?.runtime;
  if (remote) {
    return {
      ready: true,
      resume: {
        kind: "mock",
        href: simulationRunHref("/simulation/new", {
          runId: remote.runId,
          blueprintVersion: remote.blueprintVersion,
          taskIds: remote.tasks.map(({ id }) => id),
        }),
        current: remote.currentIndex + 1,
        total: remote.tasks.length,
        answered: answeredCount(remote.answers),
        remainingMinutes: minutesRemaining(remote.endsAt, now),
      },
    };
  }

  if (practiceSelection.resume !== null) {
    const practice = practiceSelection.resume;
    const currentPosition = practiceCatalog.examPositionByTaskId.get(
      practice.currentTask.id,
    );
    if (currentPosition === undefined) return { ready: true, resume: null };
    return {
      ready: true,
      resume: {
        kind: "practice",
        href: practiceRuntimeResumeHref(practice, "/cabinet"),
        currentTaskId: practice.currentTask.id,
        currentPosition,
        current: practice.current,
        total: practice.total,
        completed: practice.completed,
      },
    };
  }

  return { ready: true, resume: null };
}

function isCloudPending(status: string): boolean {
  return status === "idle" || status === "loading";
}

function answeredCount(answers: readonly (readonly string[])[]): number {
  return answers.filter((parts) => parts.some((answer) => answer.trim() !== ""))
    .length;
}

function minutesRemaining(endsAt: number | null, now: number): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 60_000));
}
