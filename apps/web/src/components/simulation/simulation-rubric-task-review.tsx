"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import type {
  SimulationRenderedReviewItem,
  SimulationTaskView,
} from "@/lib/simulation-types";

export function SimulationRubricEvidence({
  task,
  answers,
  item,
}: {
  task: SimulationTaskView;
  answers: readonly string[];
  item: SimulationRenderedReviewItem;
}) {
  const t = useTranslations("simulation");
  return (
    <section className="min-w-0">
      <p className="text-sm font-semibold text-brand-ink">
        {t("positionLabel", { position: task.examPosition })} · {task.topicName}
      </p>
      <RenderedMarkdown
        html={task.statementHtml}
        openImageLabel={t("openImage")}
        closeImageLabel={t("closeImage")}
        className="mt-4"
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AnswerSummary
          label={t("yourAnswer")}
          value={formatAnswer(answers, task.fields, t("noAnswer"))}
        />
        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800">
            {t("correctAnswer")}
          </p>
          <RenderedMarkdown
            html={item.correctAnswerHtml}
            openImageLabel={t("openImage")}
            closeImageLabel={t("closeImage")}
            className="mt-2 text-sm [&_p]:m-0"
          />
        </div>
      </div>

      <details className="mt-6 border-y border-line py-4">
        <summary className="cursor-pointer font-semibold text-brand-ink">
          {t("viewSolution")}
        </summary>
        <RenderedMarkdown
          html={item.solutionHtml}
          openImageLabel={t("openImage")}
          closeImageLabel={t("closeImage")}
          className="mt-4"
        />
      </details>
    </section>
  );
}

export function SimulationRubricScoring({
  item,
  score,
  maxPoints,
  onScore,
}: {
  item: SimulationRenderedReviewItem;
  score: number | null;
  maxPoints: number;
  onScore: (score: number) => void;
}) {
  const t = useTranslations("simulation");
  const maxScore = item.rubric.reduce(
    (sum, criterion) => sum + criterion.points,
    0,
  );
  return (
    <section className="min-w-0 lg:border-l lg:border-line lg:pl-10">
      <h2 className="text-xl font-bold">{t("rubricCriteriaTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {t("rubricCriteriaIntro")}
      </p>
      <ol className="mt-5 border-t border-line">
        {item.rubric.map((criterion) => (
          <li
            key={criterion.id}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-line py-4"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-page text-sm font-bold tabular-nums text-brand-ink">
              +{criterion.points}
            </span>
            <RenderedMarkdown
              html={criterion.textHtml}
              openImageLabel={t("openImage")}
              closeImageLabel={t("closeImage")}
              className="text-sm leading-6 [&_p]:m-0"
            />
          </li>
        ))}
      </ol>

      <fieldset className="mt-6">
        <legend className="font-semibold">{t("rubricScoreLabel")}</legend>
        <p className="mt-1 text-sm leading-6 text-muted">
          {t("rubricScoreHelp", { max: maxScore })}
        </p>
        <div
          className="mt-4 grid overflow-hidden rounded-lg border border-line"
          style={{
            gridTemplateColumns: `repeat(${maxScore + 1}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: maxScore + 1 }, (_, value) => (
            <button
              key={value}
              type="button"
              aria-pressed={score === value}
              onClick={() => onScore(value)}
              className={`h-12 border-r border-line text-sm font-bold tabular-nums last:border-r-0 ${
                score === value
                  ? "bg-brand text-on-brand"
                  : "bg-surface hover:bg-page"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="mt-3 flex min-h-6 items-center gap-2 text-sm font-semibold">
          {score === null ? (
            <span className="text-amber-800">{t("rubricNotSelected")}</span>
          ) : (
            <>
              <CheckCircle2 aria-hidden className="h-4 w-4 text-emerald-700" />
              {t("rubricPointsValue", { score, max: maxPoints })}
            </>
          )}
        </p>
      </fieldset>
    </section>
  );
}

function AnswerSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-red-50 p-4">
      <p className="text-xs font-semibold text-red-800">{label}</p>
      <p className="mt-2 break-words font-mono text-sm leading-6">{value}</p>
    </div>
  );
}

function formatAnswer(
  answers: readonly string[],
  fields: readonly { label?: string }[],
  empty: string,
): string {
  const parts = answers.flatMap((answer, index) => {
    const value = answer.trim();
    if (!value) return [];
    return [`${fields[index]?.label ? `${fields[index].label} ` : ""}${value}`];
  });
  return parts.length > 0 ? parts.join(" · ") : empty;
}
