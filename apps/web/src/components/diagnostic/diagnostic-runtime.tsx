"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic } from "@/lib/diagnostic-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useSimulation } from "@/lib/simulation-store";
import { DiagnosticQuestion } from "./diagnostic-question";
import { LoadingState, RunNotice } from "./diagnostic-status";
import type { DiagnosticTaskView } from "./types";

export function DiagnosticRuntime({
  runId,
  tasks,
}: {
  runId: string;
  tasks: DiagnosticTaskView[];
}) {
  const t = useTranslations("diagnostic");
  const hydrated = useHydrated();
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
  const activeMock =
    simulationPhase === "running" || simulationPhase === "grading";

  useEffect(() => {
    if (hydrated && !startedRef.current && !activeMock) {
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
  }, [activeMock, canonicalTaskIds, hydrated, runId, start, tasks]);

  useEffect(() => {
    const current = useDiagnostic.getState();
    if (hydrated && current.runId === runId && current.phase === "done") {
      router.replace(resultHref);
    }
  }, [hydrated, phase, resultHref, router, runId]);

  if (!hydrated) return <LoadingState label={t("loading")} />;
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
  return <DiagnosticQuestion tasks={tasks} />;
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
