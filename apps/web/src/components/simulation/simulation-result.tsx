"use client";

import { AlertTriangle, ArrowRight, RotateCcw, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  compatibleSimulationHistory,
  mergeSimulationArchive,
  simulationContentChanged,
} from "@/lib/simulation-archive";
import { useSimulationArchive } from "@/lib/simulation-archive-store";
import { persistCompletedSimulationRun } from "@/lib/simulation-progress";
import { renderSimulationReview } from "@/lib/simulation-review";
import { buildSimulationResultSummary } from "@/lib/simulation-result";
import { useSimulation, useSimulationHistory } from "@/lib/simulation-store";
import {
  simulationRunHref,
  type SimulationRunQuery,
} from "@/lib/simulation-run";
import {
  attachSimulationReview,
  parseSimulationGradeItems,
  parseSimulationReviewItems,
  type SimulationGradeItem,
  type SimulationHistoryEntry,
  type SimulationRenderedReviewItem,
  type SimulationTaskView,
} from "@/lib/simulation-types";
import { taskPracticeHref } from "@/lib/task-bank";
import { useHydrated } from "@/lib/use-hydrated";
import { AnswersTable, ErrorReview } from "./simulation-result-answers";
import { ResultMetrics } from "./simulation-result-metrics";
import { ResultPositions } from "./simulation-result-positions";

export function SimulationResult({
  run,
  tasks: taskViews,
  contentRevision,
}: {
  run: SimulationRunQuery;
  tasks: SimulationTaskView[];
  contentRevision: string;
}) {
  const t = useTranslations("simulation");
  const router = useRouter();
  const hydrated = useHydrated();
  const localHistory = useSimulationHistory();
  const archive = useSimulationArchive();
  const activeRunId = useSimulation((state) => state.runId);
  const activeVersion = useSimulation((state) => state.blueprintVersion);
  const review = useSimulation((state) => state.review);
  const reset = useSimulation((state) => state.reset);
  const [rendered, setRendered] = useState<RenderedReviewState>(null);
  const mergedArchive = useMemo(
    () =>
      archive === null || localHistory === null
        ? []
        : mergeSimulationArchive(localHistory, archive.entries),
    [archive, localHistory],
  );
  const history = useMemo(
    () => compatibleSimulationHistory(mergedArchive),
    [mergedArchive],
  );
  const entry = history.find((candidate) => candidate.id === run.runId);
  const contentChanged = entry
    ? simulationContentChanged(entry, contentRevision, taskViews)
    : false;
  const matchingStoredReview =
    localHistory !== null &&
    activeRunId === run.runId &&
    activeVersion === run.blueprintVersion &&
    review.length === taskViews.length;
  const reviewSource = entry
    ? [
        matchingStoredReview ? "stored" : "history",
        entry.id,
        entry.finishedAt,
        contentChanged,
        run.blueprintVersion,
        run.taskIds.join(","),
      ].join(":")
    : `missing:${run.runId}`;

  useEffect(() => {
    if (hydrated && entry) persistCompletedSimulationRun(entry);
  }, [entry, hydrated]);

  useEffect(() => {
    let current = true;
    const load = matchingStoredReview
      ? renderSimulationReview(review)
      : entry
        ? loadHistoricalReview(run, entry, taskViews, contentChanged)
        : Promise.resolve(null);
    void load.then(
      (items) => {
        if (current) setRendered({ source: reviewSource, items });
      },
      () => {
        if (current) setRendered({ source: reviewSource, items: null });
      },
    );
    return () => {
      current = false;
    };
  }, [
    contentChanged,
    entry,
    matchingStoredReview,
    review,
    reviewSource,
    run,
    taskViews,
  ]);

  if (
    !hydrated ||
    archive === null ||
    localHistory === null ||
    rendered?.source !== reviewSource
  ) {
    return <ResultLoading />;
  }
  const tasks = rendered.items
    ? attachSimulationReview(taskViews, rendered.items)
    : null;
  const summary =
    entry && tasks ? buildSimulationResultSummary(entry, history, tasks) : null;
  if (!entry || !tasks || !summary) return <ResultUnavailable />;

  const resultHref = simulationRunHref("/simulation/result", run);
  const firstPracticeTask = summary.practiceTaskIds
    .map((taskId) => tasks.find((task) => task.id === taskId))
    .find((task) => task !== undefined);
  const practiceHref = taskPracticeHref(
    firstPracticeTask,
    resultHref,
    summary.practiceTaskIds,
  );
  const hasErrors =
    summary.weakPositions.length > 0 || summary.partialPositions.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-brand-ink">
          {t("resultKicker")}
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
          {t("resultTitle")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          {t("resultIntro")}
        </p>
      </header>

      {entry.timedOut && <ResultNotice>{t("timeExpiredResult")}</ResultNotice>}
      {!summary.complete && (
        <ResultNotice>
          {t("partialResult", {
            answered: summary.answeredCount,
            total: summary.totalCount,
          })}
        </ResultNotice>
      )}
      {contentChanged && (
        <ResultNotice>{t("historicalContentChanged")}</ResultNotice>
      )}

      <div className="mt-8">
        <ResultMetrics summary={summary} />
      </div>
      <ResultPositions
        strong={summary.strongPositions}
        partial={summary.partialPositions}
        weak={summary.weakPositions}
        unanswered={summary.unansweredPositions}
      />

      <section className="mt-8 border-y border-line py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Link
            href={summary.practiceTaskIds.length > 0 ? practiceHref : "/tasks"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
          >
            {hasErrors
              ? t("practiceWeak")
              : summary.unansweredPositions.length > 0
                ? t("practiceUnanswered")
                : t("browseMoreTasks")}
            <ArrowRight aria-hidden className="h-5 w-5" />
          </Link>
          {hasErrors && (
            <a
              href="#error-review"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-5 py-3 font-semibold hover:border-brand hover:text-brand-ink"
            >
              {t("viewErrors")}
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              reset();
              router.push("/simulation/new");
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line px-5 py-3 font-semibold hover:border-brand hover:text-brand-ink"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            {t("retake")}
          </button>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
          {t(
            summary.rubricAssessedCount > 0
              ? "rubricEstimateDisclaimer"
              : "estimateDisclaimer",
          )}
        </p>
      </section>

      <ErrorReview entry={entry} tasks={tasks} />
      <AnswersTable entry={entry} tasks={tasks} />
    </main>
  );
}

type RenderedReviewState = {
  source: string;
  items: SimulationRenderedReviewItem[] | null;
} | null;

async function loadHistoricalReview(
  run: SimulationRunQuery,
  entry: SimulationHistoryEntry,
  tasks: SimulationTaskView[],
  allowGradeMismatch: boolean,
): Promise<SimulationRenderedReviewItem[] | null> {
  const response = await fetch("/api/content/simulation-grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blueprintVersion: run.blueprintVersion,
      taskIds: run.taskIds,
      answers: entry.answers.map((answers, index) =>
        entry.results[index].outcome === "unanswered"
          ? tasks[index].fields.map((_, part) => answers[part] ?? "")
          : answers,
      ),
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const candidate = payload as Record<string, unknown>;
  const results = parseSimulationGradeItems(candidate.results, tasks);
  const review = parseSimulationReviewItems(candidate.review, tasks);
  if (
    !results ||
    !review ||
    (!allowGradeMismatch &&
      !sameGrade(results, entry.results, entry.rubricScores))
  ) {
    return null;
  }
  return renderSimulationReview(review);
}

function sameGrade(
  left: readonly SimulationGradeItem[],
  right: SimulationHistoryEntry["results"],
  rubricScores: SimulationHistoryEntry["rubricScores"],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (result, index) =>
        result.taskId === right[index].taskId &&
        result.maxPoints === right[index].maxPoints &&
        (rubricScores?.[index] === null || rubricScores?.[index] === undefined
          ? result.outcome === right[index].outcome &&
            result.earnedPoints === right[index].earnedPoints
          : result.outcome !== "correct" &&
            (rubricScores[index] === 0
              ? right[index].outcome === result.outcome &&
                right[index].earnedPoints === 0
              : right[index].outcome === "partial" &&
                right[index].earnedPoints === rubricScores[index])),
    )
  );
}

function ResultNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex max-w-3xl items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function ResultLoading() {
  const t = useTranslations("simulation");
  return (
    <main className="flex min-h-[32rem] items-center justify-center px-5 text-muted">
      {t("loadingResult")}
    </main>
  );
}

function ResultUnavailable() {
  const t = useTranslations("simulation");
  return (
    <main className="mx-auto flex min-h-[32rem] max-w-lg flex-col items-center justify-center px-5 text-center">
      <SearchX aria-hidden className="h-8 w-8 text-muted" />
      <h1 className="mt-5 text-2xl font-bold">{t("resultUnavailableTitle")}</h1>
      <p className="mt-3 leading-7 text-muted">
        {t("resultUnavailableDescription")}
      </p>
      <Link
        href="/simulation"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-hover"
      >
        {t("back")}
      </Link>
    </main>
  );
}
