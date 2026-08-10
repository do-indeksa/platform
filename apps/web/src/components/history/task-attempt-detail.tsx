"use client";

import { ArrowLeft, ArrowRight, LoaderCircle, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { useTaskHistory } from "@/lib/task-history-store";
import { useHydrated } from "@/lib/use-hydrated";
import { OutcomeBadge } from "./outcome-badge";

export function TaskAttemptDetail({
  attemptId,
  task,
  solveAgainHref,
  similarTask,
}: {
  attemptId: string;
  task: {
    id: string;
    slot: number;
    topicName: string;
    statementHtml: string;
    correctAnswerHtml: string;
    hintsHtml: string[];
    solutionHtml: string;
    fieldLabels: (string | null)[];
  };
  solveAgainHref: string;
  similarTask: { label: string; href: string } | null;
}) {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;
  const hydrated = useHydrated();
  const entries = useTaskHistory();

  if (!hydrated || entries === null) {
    return (
      <main className="mx-auto flex min-h-[32rem] w-full max-w-4xl items-center justify-center px-5 sm:px-8">
        <p className="flex items-center gap-3 text-muted">
          <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
          {t("loadingAttempt")}
        </p>
      </main>
    );
  }

  const entry = entries.find(
    (candidate) => candidate.id === attemptId && candidate.taskId === task.id,
  );
  if (!entry) return <UnavailableAttempt />;

  const attemptedAt = new Intl.DateTimeFormat(htmlLanguage(locale), {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(entry.at));

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pt-7 pb-28 sm:px-8 sm:pt-10 md:pb-16">
      <Link
        href="/history?tab=tasks"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("backToHistory")}
      </Link>

      <header className="mt-6 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-brand-ink">
            {t("detailKicker")}
          </p>
          <OutcomeBadge outcome={entry.outcome} />
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          {t("positionTask", { position: task.slot, id: task.id })}
        </h1>
        <p className="mt-3 text-muted">
          {task.topicName} · {attemptedAt} · {t(`source.${entry.source}`)}
        </p>
      </header>

      <section aria-labelledby="statement-heading" className="py-8">
        <h2 id="statement-heading" className="mb-5 text-xl font-bold">
          {t("statementTitle")}
        </h2>
        <RenderedMarkdown
          html={task.statementHtml}
          openImageLabel={t("openImage")}
          closeImageLabel={t("closeImage")}
          className="text-lg leading-8"
        />
      </section>

      <section
        aria-labelledby="answer-comparison-heading"
        className="grid border-y border-line sm:grid-cols-2"
      >
        <h2 id="answer-comparison-heading" className="sr-only">
          {t("answerComparisonTitle")}
        </h2>
        <div className="py-6 sm:pr-8">
          <h3 className="text-sm font-semibold text-muted">
            {t("yourAnswer")}
          </h3>
          <AnswerList answers={entry.answers} fieldLabels={task.fieldLabels} />
        </div>
        <div className="border-t border-line py-6 sm:border-t-0 sm:border-l sm:pl-8">
          <h3 className="mb-3 text-sm font-semibold text-muted">
            {t("correctAnswer")}
          </h3>
          <RenderedMarkdown
            html={task.correctAnswerHtml}
            openImageLabel={t("openImage")}
            closeImageLabel={t("closeImage")}
          />
        </div>
      </section>

      <section aria-labelledby="help-heading" className="py-8">
        <h2 id="help-heading" className="text-xl font-bold">
          {t("helpTitle")}
        </h2>
        <p className="mt-2 leading-7 text-muted">
          {entry.helpLevel === 0
            ? t("noHelpUsed")
            : entry.helpLevel === 3
              ? t("solutionUsed")
              : t("hintsUsed", { count: entry.helpLevel })}
        </p>
        {entry.helpLevel > 0 && entry.helpLevel < 3 && (
          <div className="mt-5 space-y-5 border-l-2 border-amber-300 pl-5">
            {task.hintsHtml.slice(0, entry.helpLevel).map((hint, index) => (
              <div key={index}>
                <p className="mb-2 text-sm font-semibold text-amber-800">
                  {t("hintLabel", { number: index + 1 })}
                </p>
                <RenderedMarkdown
                  html={hint}
                  openImageLabel={t("openImage")}
                  closeImageLabel={t("closeImage")}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="border-y border-line py-6">
        <summary className="cursor-pointer text-lg font-bold text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
          {t("solutionTitle")}
        </summary>
        <RenderedMarkdown
          html={task.solutionHtml}
          openImageLabel={t("openImage")}
          closeImageLabel={t("closeImage")}
          className="mt-6"
        />
      </details>

      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={solveAgainHref}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-hover"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {t("solveAgain")}
        </Link>
        {similarTask && (
          <Link
            href={similarTask.href}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line px-5 py-3 font-semibold transition-colors hover:border-brand hover:text-brand-ink"
          >
            {t("openSimilar", { task: similarTask.label })}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        )}
      </section>
    </main>
  );
}

function AnswerList({
  answers,
  fieldLabels,
}: {
  answers: string[];
  fieldLabels: (string | null)[];
}) {
  const t = useTranslations("history");
  return (
    <dl className="mt-3 space-y-3">
      {answers.map((answer, index) => (
        <div key={index}>
          <dt className="text-xs text-muted">
            {fieldLabels[index] ?? t("answerPart", { number: index + 1 })}
          </dt>
          <dd className="mt-1 font-mono text-sm break-words">
            {answer.trim() || t("noAnswer")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function UnavailableAttempt() {
  const t = useTranslations("history");
  return (
    <main className="mx-auto flex min-h-[32rem] w-full max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
      <h1 className="text-3xl font-bold">{t("attemptUnavailableTitle")}</h1>
      <p className="mt-3 max-w-lg leading-7 text-muted">
        {t("attemptUnavailableDescription")}
      </p>
      <Link
        href="/history?tab=tasks"
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand hover:bg-brand-hover"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("backToHistory")}
      </Link>
    </main>
  );
}
