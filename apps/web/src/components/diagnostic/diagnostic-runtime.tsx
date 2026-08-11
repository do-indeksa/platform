"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DiagnosticCloudCatalog } from "@/lib/diagnostic-cloud-types";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useDiagnosticCloudBootstrap } from "@/lib/use-diagnostic-cloud";
import {
  isSimulationActive,
  useSimulation,
  useSimulationOwnerKnown,
} from "@/lib/simulation-store";
import { DiagnosticCloudConflictNotice } from "./diagnostic-cloud-conflict";
import { DiagnosticQuestion } from "./diagnostic-question";
import { LoadingState, RunNotice } from "./diagnostic-status";
import type { DiagnosticTaskView } from "./types";

export function DiagnosticRuntime({
  runId,
  tasks,
  blueprintVersion,
  contentRevision,
  diagnosticCatalog,
}: {
  runId: string;
  tasks: DiagnosticTaskView[];
  blueprintVersion: string;
  contentRevision: string;
  diagnosticCatalog: DiagnosticCloudCatalog;
}) {
  const t = useTranslations("diagnostic");
  const hydrated = useHydrated();
  const cloud = useDiagnosticCloudBootstrap(diagnosticCatalog);
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const simulationOwnerKnown = useSimulationOwnerKnown();
  const router = useRouter();
  const phase = useDiagnostic((state) => state.phase);
  const activeRunId = useDiagnostic((state) => state.runId);
  const taskIds = useDiagnostic((state) => state.taskIds);
  const start = useDiagnostic((state) => state.start);
  const simulationPhase = useSimulation((state) => state.phase);
  const startedRef = useRef(false);
  const canonicalTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const resultHref = diagnosticRunHref(
    "/diagnostic/result",
    runId,
    canonicalTaskIds,
  );
  const activeMock = isSimulationActive(simulationPhase);

  useEffect(() => {
    if (
      hydrated &&
      diagnosticOwnerKnown &&
      simulationOwnerKnown &&
      cloud.status !== "idle" &&
      cloud.status !== "loading" &&
      cloud.status !== "conflict" &&
      !startedRef.current &&
      !activeMock
    ) {
      startedRef.current = true;
      const current = useDiagnostic.getState();
      const slots = tasks.map((task) => task.slot);
      const answerPartCounts = tasks.map((task) => task.fields.length);
      if (current.runId === runId && current.phase !== null) {
        const compatible =
          sameValues(current.taskIds, canonicalTaskIds) &&
          sameValues(current.slots, slots) &&
          sameValues(
            current.answers.map((answers) => answers.length),
            answerPartCounts,
          );
        if (compatible) return;
        current.reset();
      }
      start({
        runId,
        taskIds: canonicalTaskIds,
        slots,
        answerPartCounts,
      });
    }
  }, [
    activeMock,
    canonicalTaskIds,
    cloud.status,
    diagnosticOwnerKnown,
    hydrated,
    runId,
    simulationOwnerKnown,
    start,
    tasks,
  ]);

  useEffect(() => {
    const current = useDiagnostic.getState();
    if (
      hydrated &&
      diagnosticOwnerKnown &&
      current.runId === runId &&
      current.phase === "done"
    ) {
      router.replace(resultHref);
    }
  }, [diagnosticOwnerKnown, hydrated, phase, resultHref, router, runId]);

  if (
    !hydrated ||
    !diagnosticOwnerKnown ||
    !simulationOwnerKnown ||
    cloud.status === "idle" ||
    cloud.status === "loading"
  ) {
    return <LoadingState label={t("loading")} />;
  }
  if (cloud.status === "conflict") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5 py-10">
        <DiagnosticCloudConflictNotice />
      </main>
    );
  }
  if (activeMock) {
    return (
      <RunNotice
        message={t("mockActive")}
        href="/simulation/new"
        action={t("resumeMock")}
      />
    );
  }
  if (phase === "running" && activeRunId !== runId) {
    const resumeHref = diagnosticRunHref(
      "/diagnostic/new",
      activeRunId as string,
      taskIds,
    );
    return (
      <RunNotice
        message={t("otherDiagnosticActive")}
        href={resumeHref}
        action={t("resumeCta")}
      />
    );
  }
  if (activeRunId !== runId || phase !== "running") {
    return <LoadingState label={t("redirecting")} />;
  }
  return (
    <DiagnosticQuestion
      tasks={tasks}
      blueprintVersion={blueprintVersion}
      contentRevision={contentRevision}
    />
  );
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
