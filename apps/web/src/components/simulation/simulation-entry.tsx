"use client";

import { ArrowRight, Clock3, FileCheck2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { SimulationHistory } from "@/components/simulation-history";
import { Link } from "@/i18n/navigation";
import {
  isSimulationActive,
  useSimulation,
  useSimulationHistory,
} from "@/lib/simulation-store";
import { simulationRunHref } from "@/lib/simulation-run";
import { useHydrated } from "@/lib/use-hydrated";

export function SimulationEntry({
  freshStartHref,
  taskCount,
  durationMinutes,
  maxPoints,
}: {
  freshStartHref: string;
  taskCount: number;
  durationMinutes: number;
  maxPoints: number;
}) {
  const t = useTranslations("simulation");
  const hydrated = useHydrated();
  const phase = useSimulation((state) => state.phase);
  const runId = useSimulation((state) => state.runId);
  const blueprintVersion = useSimulation((state) => state.blueprintVersion);
  const tasks = useSimulation((state) => state.tasks);
  const history = useSimulationHistory();
  const taskIds = tasks.map((task) => task.id);
  const active = hydrated && isSimulationActive(phase);
  const completed =
    hydrated &&
    phase === "done" &&
    history?.some((entry) => entry.id === runId) === true;
  const storedRun =
    runId && blueprintVersion && taskIds.length > 0
      ? { runId, blueprintVersion, taskIds }
      : null;
  const primaryHref =
    active && storedRun
      ? simulationRunHref("/simulation/new", storedRun)
      : completed && storedRun
        ? simulationRunHref("/simulation/result", storedRun)
        : freshStartHref;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-brand-ink">{t("kicker")}</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          {t("entryIntro")}
        </p>
      </header>

      <dl className="mt-8 grid border-y border-line sm:grid-cols-3">
        <Fact icon={FileCheck2} label={t("taskCountFact")} value={taskCount} />
        <Fact
          icon={Clock3}
          label={t("durationFact")}
          value={t("minutesValue", { minutes: durationMinutes })}
        />
        <Fact icon={ShieldCheck} label={t("maxPointsFact")} value={maxPoints} />
      </dl>

      <section className="mt-8 border-b border-line pb-9">
        {active && (
          <p className="mb-4 text-sm font-semibold text-amber-800">
            {t("activeAttemptNote")}
          </p>
        )}
        {completed && (
          <p className="mb-4 text-sm font-semibold text-emerald-700">
            {t("completedAttemptNote")}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={primaryHref}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
          >
            {active
              ? t("resumeMock")
              : completed
                ? t("viewLatestResult")
                : t("startCta")}
            <ArrowRight aria-hidden className="h-5 w-5" />
          </Link>
          {completed && (
            <Link
              href={freshStartHref}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-5 py-3 font-semibold hover:border-brand hover:text-brand-ink"
            >
              {t("startAnother")}
            </Link>
          )}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          {t("entryDisclaimer")}
        </p>
      </section>

      <SimulationHistory />
    </main>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 py-4 sm:px-5 sm:first:pl-0">
      <Icon aria-hidden className="h-5 w-5 text-brand" />
      <div>
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  );
}
