"use client";

import { ArrowLeft, ArrowRight, ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { renderSimulationReview } from "@/lib/simulation-review";
import { simulationRubricIndexes } from "@/lib/simulation-rubric";
import { useSimulation } from "@/lib/simulation-store";
import type { SimulationRenderedReviewItem } from "@/lib/simulation-types";
import {
  SimulationRubricEvidence,
  SimulationRubricScoring,
} from "./simulation-rubric-task-review";
import { SubmissionStatus } from "./simulation-status";

export function SimulationRubricReview({
  onScore,
  onComplete,
}: {
  onScore: (taskIndex: number, score: number) => boolean;
  onComplete: () => boolean;
}) {
  const t = useTranslations("simulation");
  const tasks = useSimulation((state) => state.tasks);
  const answers = useSimulation((state) => state.answers);
  const results = useSimulation((state) => state.results);
  const review = useSimulation((state) => state.review);
  const scores = useSimulation((state) => state.rubricScores);
  const indexes = useMemo(
    () => simulationRubricIndexes(results, review),
    [results, review],
  );
  const [position, setPosition] = useState(() => {
    const firstIncomplete = indexes.findIndex(
      (index) => scores[index] === null,
    );
    return firstIncomplete < 0
      ? Math.max(indexes.length - 1, 0)
      : firstIncomplete;
  });
  const [rendered, setRendered] = useState<
    SimulationRenderedReviewItem[] | null
  >(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void renderSimulationReview(review).then(
      (items) => {
        if (current) setRendered(items);
      },
      () => {
        if (current) setRenderFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [renderAttempt, review]);

  if (renderFailed) {
    return (
      <SubmissionStatus
        label={t("rubricTitle")}
        error={t("rubricLoadFailed")}
        retry={() => {
          setRendered(null);
          setRenderFailed(false);
          setRenderAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (rendered === null || indexes.length === 0) {
    return <SubmissionStatus label={t("rubricLoading")} />;
  }
  const taskIndex = indexes[Math.min(position, indexes.length - 1)];
  const task = tasks[taskIndex];
  const item = rendered[taskIndex];
  const score = scores[taskIndex];
  const completed = indexes.filter((index) => scores[index] !== null).length;
  const allComplete = completed === indexes.length;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
          <ClipboardCheck aria-hidden className="h-4 w-4" />
          {t("rubricKicker")}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          {t("rubricTitle")}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {t("rubricIntro")}
        </p>
      </header>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-y border-line py-4 text-sm">
        <p className="font-semibold tabular-nums">
          {t("rubricProgress", {
            current: position + 1,
            total: indexes.length,
          })}
        </p>
        <p className="text-muted tabular-nums">
          {t("rubricCompleted", { completed, total: indexes.length })}
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] lg:gap-12">
        <SimulationRubricEvidence
          task={task}
          answers={answers[taskIndex]}
          item={item}
        />
        <SimulationRubricScoring
          item={item}
          score={score}
          maxPoints={task.maxPoints}
          onScore={(value) => onScore(taskIndex, value)}
        />
      </div>

      <footer className="mt-9 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={position === 0}
          onClick={() => setPosition((current) => Math.max(0, current - 1))}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {t("rubricPrevious")}
        </button>
        {position < indexes.length - 1 ? (
          <button
            type="button"
            onClick={() =>
              setPosition((current) =>
                Math.min(indexes.length - 1, current + 1),
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand-hover"
          >
            {t("rubricNext")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!allComplete}
            onClick={onComplete}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-muted"
          >
            {allComplete ? t("rubricFinish") : t("rubricIncomplete")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        )}
      </footer>
    </main>
  );
}
