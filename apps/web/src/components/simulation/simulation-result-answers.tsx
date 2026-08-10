"use client";

import { useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import type {
  SimulationHistoryEntry,
  SimulationOutcome,
  SimulationResultTaskView,
} from "@/lib/simulation-types";

export function ErrorReview({
  entry,
  tasks,
}: {
  entry: SimulationHistoryEntry;
  tasks: SimulationResultTaskView[];
}) {
  const t = useTranslations("simulation");
  const errors = tasks.flatMap((task, index) =>
    entry.results[index].outcome === "incorrect" ? [{ task, index }] : [],
  );
  if (errors.length === 0) return null;

  return (
    <section id="error-review" className="mt-12 scroll-mt-8">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold">{t("errorReviewTitle")}</h2>
        <p className="mt-2 leading-7 text-muted">{t("errorReviewIntro")}</p>
      </div>
      <div className="mt-6 border-t border-line">
        {errors.map(({ task, index }) => (
          <article key={task.id} className="border-b border-line py-7">
            <p className="text-sm font-semibold text-red-700">
              {t("positionLabel", { position: task.examPosition })} ·{" "}
              {task.topicName}
            </p>
            <RenderedMarkdown
              html={task.statementHtml}
              openImageLabel={t("openImage")}
              closeImageLabel={t("closeImage")}
              className="mt-3"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <AnswerBlock
                label={t("yourAnswer")}
                value={formatUserAnswer(
                  entry.answers[index],
                  task.fields,
                  t("noAnswer"),
                )}
              />
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-800">
                  {t("correctAnswer")}
                </p>
                <RenderedMarkdown
                  html={task.correctAnswerHtml}
                  openImageLabel={t("openImage")}
                  closeImageLabel={t("closeImage")}
                  className="mt-2 text-sm [&_p]:m-0"
                />
              </div>
            </div>
            <details className="mt-5 border-t border-line pt-4">
              <summary className="cursor-pointer font-semibold text-brand-ink">
                {t("viewSolution")}
              </summary>
              <RenderedMarkdown
                html={task.solutionHtml}
                openImageLabel={t("openImage")}
                closeImageLabel={t("closeImage")}
                className="mt-4"
              />
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AnswersTable({
  entry,
  tasks,
}: {
  entry: SimulationHistoryEntry;
  tasks: SimulationResultTaskView[];
}) {
  const t = useTranslations("simulation");
  return (
    <section id="answers" className="mt-12 scroll-mt-8">
      <h2 className="text-2xl font-bold">{t("answersTitle")}</h2>
      <p className="mt-2 max-w-2xl leading-7 text-muted">{t("answersIntro")}</p>

      <div className="mt-6 hidden overflow-hidden rounded-lg border border-line sm:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-page text-xs text-muted">
            <tr>
              <th className="w-14 px-4 py-3 font-semibold">
                {t("numberColumn")}
              </th>
              <th className="px-4 py-3 font-semibold">{t("yourAnswer")}</th>
              <th className="px-4 py-3 font-semibold">{t("correctAnswer")}</th>
              <th className="w-32 px-4 py-3 font-semibold">
                {t("resultColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, index) => {
              const outcome = entry.results[index].outcome;
              return (
                <tr key={task.id} className="border-t border-line align-top">
                  <td className="px-4 py-4 font-semibold tabular-nums">
                    {task.examPosition}
                  </td>
                  <td className="break-words px-4 py-4 font-mono text-xs leading-6">
                    {formatUserAnswer(
                      entry.answers[index],
                      task.fields,
                      t("noAnswer"),
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <RenderedMarkdown
                      html={task.correctAnswerHtml}
                      openImageLabel={t("openImage")}
                      closeImageLabel={t("closeImage")}
                      className="text-xs [&_p]:m-0"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <OutcomeBadge outcome={outcome} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ol className="mt-6 border-t border-line sm:hidden">
        {tasks.map((task, index) => (
          <li key={task.id} className="border-b border-line py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">
                {t("positionLabel", { position: task.examPosition })}
              </p>
              <OutcomeBadge outcome={entry.results[index].outcome} />
            </div>
            <p className="mt-4 text-xs font-semibold text-muted">
              {t("yourAnswer")}
            </p>
            <p className="mt-1 break-words font-mono text-sm leading-6">
              {formatUserAnswer(
                entry.answers[index],
                task.fields,
                t("noAnswer"),
              )}
            </p>
            <p className="mt-4 text-xs font-semibold text-muted">
              {t("correctAnswer")}
            </p>
            <RenderedMarkdown
              html={task.correctAnswerHtml}
              openImageLabel={t("openImage")}
              closeImageLabel={t("closeImage")}
              className="mt-1 text-sm [&_p]:m-0"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnswerBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-red-50 p-4">
      <p className="text-xs font-semibold text-red-800">{label}</p>
      <p className="mt-2 break-words font-mono text-sm leading-6">{value}</p>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: SimulationOutcome }) {
  const t = useTranslations("simulation");
  const styles = {
    correct: "bg-emerald-50 text-emerald-800",
    incorrect: "bg-red-50 text-red-700",
    unanswered: "bg-amber-50 text-amber-900",
  }[outcome];
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${styles}`}
    >
      {t(`outcome.${outcome}`)}
    </span>
  );
}

function formatUserAnswer(
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
