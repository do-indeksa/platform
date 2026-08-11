"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudCheck,
  ListChecks,
  Play,
  SkipForward,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { DiagnosticCloudCatalog } from "@/lib/diagnostic-cloud-types";
import {
  DIAGNOSTIC_ESTIMATED_MINUTES,
  DIAGNOSTIC_TASK_COUNT,
  diagnosticRunHref,
} from "@/lib/diagnostic-run";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useDiagnosticCloudBootstrap } from "@/lib/use-diagnostic-cloud";
import {
  isSimulationActive,
  useSimulation,
  useSimulationOwnerKnown,
} from "@/lib/simulation-store";
import { DiagnosticCloudConflictNotice } from "./diagnostic-cloud-conflict";

export function DiagnosticEntry({
  freshStartHref,
  diagnosticCatalog,
}: {
  freshStartHref: string;
  diagnosticCatalog: DiagnosticCloudCatalog;
}) {
  const t = useTranslations("diagnostic");
  const router = useRouter();
  const cloud = useDiagnosticCloudBootstrap(diagnosticCatalog);
  const hydrated = useHydrated();
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const simulationOwnerKnown = useSimulationOwnerKnown();
  const diagnostic = useDiagnostic();
  const simulationPhase = useSimulation((state) => state.phase);
  const ready =
    hydrated &&
    diagnosticOwnerKnown &&
    simulationOwnerKnown &&
    cloud.status !== "idle" &&
    cloud.status !== "loading";
  const activeMock = ready && isSimulationActive(simulationPhase);
  const completed = diagnostic.outcomes.filter(Boolean).length;
  const resumeHref = diagnostic.runId
    ? diagnosticRunHref(
        diagnostic.phase === "done" ? "/diagnostic/result" : "/diagnostic/new",
        diagnostic.runId,
        diagnostic.taskIds,
      )
    : null;

  if (ready && cloud.status === "conflict") {
    return (
      <main className="mx-auto flex min-h-[32rem] w-full max-w-5xl items-center px-5 py-10 sm:px-8">
        <DiagnosticCloudConflictNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
        <section>
          <p className="mb-4 text-sm font-semibold text-brand-ink">
            {t("kicker")}
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg font-medium text-muted">
            {t("overview", {
              count: DIAGNOSTIC_TASK_COUNT,
              minutes: DIAGNOSTIC_ESTIMATED_MINUTES,
            })}
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            {t("intro")}
          </p>

          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {!ready ? (
              <span className="h-12 w-52 animate-pulse rounded-lg bg-zinc-200" />
            ) : activeMock ? (
              <Link
                href="/simulation/new"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-hover"
              >
                <Play aria-hidden="true" className="h-5 w-5" />
                {t("resumeMock")}
              </Link>
            ) : resumeHref && diagnostic.phase ? (
              <Link
                href={resumeHref}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-hover"
              >
                {diagnostic.phase === "done" ? (
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <Play aria-hidden="true" className="h-5 w-5" />
                )}
                {diagnostic.phase === "done"
                  ? t("viewResultCta")
                  : t("resumeCta")}
              </Link>
            ) : (
              <Link
                href={freshStartHref}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-hover"
              >
                <Play aria-hidden="true" className="h-5 w-5" />
                {t("startCta")}
              </Link>
            )}
            <Link
              href="/prep"
              className="inline-flex min-h-12 items-center gap-2 px-3 py-3 font-medium text-muted transition-colors hover:text-ink"
            >
              <SkipForward aria-hidden="true" className="h-5 w-5" />
              {t("skipForNow")}
            </Link>
          </div>

          {ready && activeMock && (
            <p className="mt-4 text-sm text-muted">{t("mockActive")}</p>
          )}
          {ready && diagnostic.phase === "running" && !activeMock && (
            <p className="mt-4 text-sm text-muted">
              {t("progressSaved", {
                completed,
                total: DIAGNOSTIC_TASK_COUNT,
              })}
            </p>
          )}
          {ready && cloud.enabled && cloud.status === "offline" && (
            <p className="mt-3 text-sm text-amber-800">{t("cloudOffline")}</p>
          )}
          {ready && diagnostic.phase === "done" && !activeMock && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-muted">{t("resultReady")}</span>
              <button
                type="button"
                onClick={() => {
                  diagnostic.reset();
                  router.push(`/diagnostic/new?fresh=${crypto.randomUUID()}`);
                }}
                className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline"
              >
                {t("restartCta")}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        <aside className="border-t border-line pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <ul className="space-y-7">
            <Fact icon={Clock3}>
              {t("factTime", { minutes: DIAGNOSTIC_ESTIMATED_MINUTES })}
            </Fact>
            <Fact icon={ListChecks}>{t("factCoverage")}</Fact>
            <Fact icon={SkipForward}>{t("factSkip")}</Fact>
            <Fact icon={CloudCheck}>{t("factSaved")}</Fact>
          </ul>
        </aside>
      </div>
    </main>
  );
}

function Fact({
  icon: Icon,
  children,
}: {
  icon: typeof Clock3;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-brand-ink">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="pt-2 text-sm leading-6 text-muted">{children}</span>
    </li>
  );
}
