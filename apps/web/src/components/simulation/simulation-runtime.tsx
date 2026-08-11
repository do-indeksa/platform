"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { trackTaskSolved } from "@/lib/analytics";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import type { ProgressCloudCatalog } from "@/lib/progress-cloud-types";
import {
  finishSimulationCloudUpload,
  hydrateDiscoveredSimulationRun,
  scheduleSimulationCloudUpload,
} from "@/lib/simulation-cloud-sync";
import { persistCompletedSimulationRun } from "@/lib/simulation-progress";
import {
  isSimulationActive,
  useSimulation,
  useSimulationOwnerKnown,
} from "@/lib/simulation-store";
import {
  simulationRunHref,
  type SimulationRunQuery,
} from "@/lib/simulation-run";
import {
  parseSimulationGradeItems,
  parseSimulationReviewItems,
  type SimulationTaskView,
} from "@/lib/simulation-types";
import { useHydrated } from "@/lib/use-hydrated";
import { useSimulationCloudBootstrap } from "@/lib/use-simulation-cloud";
import { SimulationCloudConflictNotice } from "./simulation-cloud-conflict";
import { SimulationQuestion } from "./simulation-question";
import { RunNotice, SubmissionStatus } from "./simulation-status";

export function SimulationRuntime({
  run,
  durationMinutes,
  tasks,
  contentRevision,
  progressCatalog,
}: {
  run: SimulationRunQuery;
  durationMinutes: number;
  tasks: SimulationTaskView[];
  contentRevision: string;
  progressCatalog: ProgressCloudCatalog;
}) {
  const t = useTranslations("simulation");
  const router = useRouter();
  const cloud = useSimulationCloudBootstrap(progressCatalog);
  const hydrated = useHydrated();
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const simulationOwnerKnown = useSimulationOwnerKnown();
  const phase = useSimulation((state) => state.phase);
  const activeRunId = useSimulation((state) => state.runId);
  const activeVersion = useSimulation((state) => state.blueprintVersion);
  const activeTasks = useSimulation((state) => state.tasks);
  const timedOut = useSimulation((state) => state.timedOut);
  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticRunId = useDiagnostic((state) => state.runId);
  const diagnosticTaskIds = useDiagnostic((state) => state.taskIds);
  const [submissionError, setSubmissionError] = useState(false);
  const submissionAttempted = useRef(false);
  const resultHref = simulationRunHref("/simulation/result", run);
  const syncTasks = useMemo(
    () =>
      tasks.map((task) => ({
        taskId: task.id,
        taskRevision: task.revision,
        slot: task.slot,
        examPosition: task.examPosition,
        topic: task.topic,
        maxPoints: task.maxPoints,
      })),
    [tasks],
  );

  useEffect(() => {
    submissionAttempted.current = false;
  }, [run.runId]);

  useEffect(() => {
    if (
      !hydrated ||
      !diagnosticOwnerKnown ||
      !simulationOwnerKnown ||
      cloud.status === "idle" ||
      cloud.status === "loading" ||
      cloud.status === "conflict" ||
      diagnosticPhase === "running"
    ) {
      return;
    }
    const remote = cloud.remote?.runtime ?? null;
    if (remote !== null) {
      if (
        remote.runId !== run.runId ||
        remote.blueprintVersion !== run.blueprintVersion ||
        !sameValues(
          remote.tasks.map((task) => task.id),
          run.taskIds,
        )
      ) {
        router.replace(
          simulationRunHref("/simulation/new", {
            runId: remote.runId,
            blueprintVersion: remote.blueprintVersion,
            taskIds: remote.tasks.map((task) => task.id),
          }),
        );
        return;
      }
      hydrateDiscoveredSimulationRun(
        run.runId,
        run.blueprintVersion,
        contentRevision,
        tasks,
      );
      return;
    }
    const current = useSimulation.getState();
    if (isSimulationActive(current.phase)) {
      if (
        current.runId === run.runId &&
        (current.blueprintVersion !== run.blueprintVersion ||
          !sameValues(
            current.tasks.map((task) => task.id),
            run.taskIds,
          ))
      ) {
        router.replace(
          simulationRunHref("/simulation/new", {
            runId: current.runId,
            blueprintVersion: current.blueprintVersion as string,
            taskIds: current.tasks.map((task) => task.id),
          }),
        );
      }
      return;
    }
    if (current.phase === "done" && current.runId === run.runId) {
      router.replace(resultHref);
      return;
    }
    if (current.phase === "done") current.reset();
    useSimulation.getState().start({
      runId: run.runId,
      blueprintVersion: run.blueprintVersion,
      contentRevision,
      durationMinutes,
      tasks,
    });
  }, [
    diagnosticPhase,
    diagnosticOwnerKnown,
    cloud.remote,
    cloud.status,
    contentRevision,
    durationMinutes,
    hydrated,
    resultHref,
    router,
    run.blueprintVersion,
    run.runId,
    run.taskIds,
    simulationOwnerKnown,
    tasks,
  ]);

  const submitCurrent = useCallback(async () => {
    const state = useSimulation.getState();
    if (
      state.phase !== "submitting" ||
      state.runId !== run.runId ||
      state.blueprintVersion !== run.blueprintVersion
    ) {
      return;
    }
    setSubmissionError(false);
    try {
      const response = await fetch("/api/content/simulation-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintVersion: run.blueprintVersion,
          taskIds: state.tasks.map((task) => task.id),
          answers: state.answers,
        }),
      });
      if (!response.ok) throw new Error(`grade failed: ${response.status}`);
      const payload = (await response.json()) as {
        results?: unknown;
        review?: unknown;
      };
      const results = parseSimulationGradeItems(payload.results, state.tasks);
      const review = parseSimulationReviewItems(payload.review, state.tasks);
      const finishedAt = Date.now();
      if (!results || !review || !state.finish(results, review, finishedAt)) {
        throw new Error("invalid grade response");
      }
      finishSimulationCloudUpload(run.runId);
      const entry = useSimulation
        .getState()
        .history.find((candidate) => candidate.id === run.runId);
      if (entry) persistCompletedSimulationRun(entry);
      for (const [index, result] of results.entries()) {
        if (result.outcome === "correct") {
          trackTaskSolved({
            source: "mock",
            position: state.tasks[index].examPosition,
          });
        }
      }
      router.replace(resultHref);
    } catch {
      submissionAttempted.current = false;
      setSubmissionError(true);
    }
  }, [resultHref, router, run.blueprintVersion, run.runId]);

  useEffect(() => {
    if (
      hydrated &&
      simulationOwnerKnown &&
      phase === "submitting" &&
      activeRunId === run.runId &&
      !submissionAttempted.current
    ) {
      submissionAttempted.current = true;
      void submitCurrent();
    }
  }, [
    activeRunId,
    hydrated,
    phase,
    run.runId,
    simulationOwnerKnown,
    submitCurrent,
  ]);

  const beginSubmission = (expired: boolean) => {
    const state = useSimulation.getState();
    scheduleSimulationCloudUpload(
      {
        state,
        tasks: syncTasks,
        blueprintVersion: progressCatalog.blueprintVersion,
        contentRevision,
      },
      true,
    );
    if (!state.beginSubmission(expired)) return;
    submissionAttempted.current = true;
    void submitCurrent();
  };

  if (
    !hydrated ||
    !diagnosticOwnerKnown ||
    !simulationOwnerKnown ||
    cloud.status === "idle" ||
    cloud.status === "loading"
  ) {
    return <SubmissionStatus label={t("assembling")} />;
  }
  if (cloud.status === "conflict") {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <SimulationCloudConflictNotice />
      </main>
    );
  }
  if (cloud.remote !== null && cloud.remote.runtime.runId !== run.runId) {
    return <SubmissionStatus label={t("redirecting")} />;
  }
  if (diagnosticPhase === "running" && !isSimulationActive(phase)) {
    const diagnosticHref =
      diagnosticRunId && diagnosticTaskIds.length > 0
        ? diagnosticRunHref(
            "/diagnostic/new",
            diagnosticRunId,
            diagnosticTaskIds,
          )
        : "/diagnostic";
    return (
      <RunNotice
        message={t("diagnosticActive")}
        href={diagnosticHref}
        action={t("resumeDiagnostic")}
      />
    );
  }
  if (isSimulationActive(phase) && activeRunId !== run.runId) {
    const resumeHref =
      activeRunId && activeVersion
        ? simulationRunHref("/simulation/new", {
            runId: activeRunId,
            blueprintVersion: activeVersion,
            taskIds: activeTasks.map((task) => task.id),
          })
        : "/simulation";
    return (
      <RunNotice
        message={t("otherMockActive")}
        href={resumeHref}
        action={t("resumeMock")}
      />
    );
  }
  if (phase === "submitting" && activeRunId === run.runId) {
    return (
      <SubmissionStatus
        label={timedOut ? t("timeExpiredTitle") : t("submittingTitle")}
        description={
          timedOut ? t("timeExpiredDescription") : t("submittingDescription")
        }
        error={submissionError ? t("submissionFailed") : null}
        retry={() => {
          submissionAttempted.current = true;
          void submitCurrent();
        }}
      />
    );
  }
  if (phase === "running" && activeRunId === run.runId) {
    return (
      <SimulationQuestion
        onSubmit={beginSubmission}
        syncTasks={syncTasks}
        blueprintVersion={progressCatalog.blueprintVersion}
        contentRevision={contentRevision}
      />
    );
  }
  return <SubmissionStatus label={t("redirecting")} />;
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
