"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic } from "@/lib/diagnostic-store";
import { simulationRunHref } from "@/lib/simulation-run";
import { isSimulationActive, useSimulation } from "@/lib/simulation-store";
import { useHydrated } from "@/lib/use-hydrated";

export function ContinueRun() {
  const t = useTranslations("home.continue");
  const hydrated = useHydrated();
  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticRunId = useDiagnostic((state) => state.runId);
  const diagnosticTaskIds = useDiagnostic((state) => state.taskIds);
  const diagnosticIndex = useDiagnostic((state) => state.currentIndex);
  const simulationPhase = useSimulation((state) => state.phase);
  const simulationRunId = useSimulation((state) => state.runId);
  const simulationVersion = useSimulation((state) => state.blueprintVersion);
  const simulationTasks = useSimulation((state) => state.tasks);
  const simulationIndex = useSimulation((state) => state.currentIndex);

  if (!hydrated) return null;

  const simulationHref =
    isSimulationActive(simulationPhase) &&
    simulationRunId !== null &&
    simulationVersion !== null &&
    simulationTasks.length > 0
      ? simulationRunHref("/simulation/new", {
          runId: simulationRunId,
          blueprintVersion: simulationVersion,
          taskIds: simulationTasks.map((task) => task.id),
        })
      : null;
  const diagnosticHref =
    diagnosticPhase === "running" &&
    diagnosticRunId !== null &&
    diagnosticTaskIds.length > 0
      ? diagnosticRunHref("/diagnostic/new", diagnosticRunId, diagnosticTaskIds)
      : null;
  const href = simulationHref ?? diagnosticHref;
  if (!href) return null;

  const activeSimulation = simulationHref !== null;
  const kind = activeSimulation ? "mock" : "diagnostic";
  const current = activeSimulation ? simulationIndex + 1 : diagnosticIndex + 1;
  const total = activeSimulation
    ? simulationTasks.length
    : diagnosticTaskIds.length;
  return (
    <section
      data-testid="continue-run"
      aria-labelledby="continue-run-title"
      className="border-b border-line bg-surface px-5 py-5 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-brand-ink">
            <RotateCcw aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-ink">
              {t("kicker")}
            </p>
            <h2 id="continue-run-title" className="mt-0.5 font-bold">
              {t(`kind.${kind}`)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("progress", { current, total })}
            </p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("resume")}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
