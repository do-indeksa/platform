"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { CheckPart } from "@/lib/answer";
import { recordAttempts } from "@/lib/attempts-store";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { Link } from "@/i18n/navigation";
import {
  markTaskHistoryHelp,
  recordTaskHistory,
} from "@/lib/task-history-store";
import { AnswerField } from "./answer-field";
import { CardButton, FeedbackCard } from "./feedback-card";
import { useTaskCheckState } from "./use-task-check-state";

export function TaskCheck({
  taskId,
  slot,
  check,
  hintsHtml,
  solutionHtml,
  nextTaskHref,
  practiceId,
}: {
  taskId: string;
  slot: number;
  check: CheckPart[];
  hintsHtml: string[];
  solutionHtml: string;
  nextTaskHref: string | null;
  practiceId: string | null;
}) {
  const t = useTranslations("tasks");
  const [state, setState] = useTaskCheckState(
    taskId,
    check.length,
    hintsHtml.length,
    t("unsavedExit"),
    practiceId,
  );
  const locked = state.solved || state.burned;
  const [checking, setChecking] = useState(false);
  const [checkerUnavailable, setCheckerUnavailable] = useState(false);
  const historyEntryId = useRef<string | null>(null);

  const recordHelp = (helpLevel: number) => {
    recordAttempts([
      { taskId, slot, correct: false, source: "practice", helpLevel },
    ]);
  };

  const verify = async () => {
    if (checking) return;
    setChecking(true);
    setCheckerUnavailable(false);
    try {
      const { checkAnswer } = await import("@/lib/answer");
      const results = check.map((part, index) =>
        checkAnswer(part, state.answers[index]),
      );
      if (results.some((result) => result === "invalid")) {
        setState((current) => ({ ...current, results }));
        return;
      }

      const correct = results.every((result) => result === "correct");
      recordAttempts([
        {
          taskId,
          slot,
          correct,
          source: "practice",
          helpLevel: state.hintsShown,
        },
      ]);
      historyEntryId.current =
        recordTaskHistory([
          {
            taskId,
            slot,
            source: "practice",
            outcome: correct ? "correct" : "incorrect",
            answers: state.answers,
            helpLevel: state.hintsShown,
          },
        ])[0]?.id ?? null;
      setState((current) => ({
        ...current,
        results,
        attempted: true,
        solved: correct,
        dirty: false,
        view: correct ? "correct" : "incorrect",
      }));
    } catch {
      setCheckerUnavailable(true);
    } finally {
      setChecking(false);
    }
  };

  const showHint = () => {
    const helpLevel = Math.max(state.hintsShown, 1);
    recordHelp(helpLevel);
    if (historyEntryId.current) {
      markTaskHistoryHelp(historyEntryId.current, helpLevel);
    }
    setState((current) => ({
      ...current,
      hintsShown: Math.max(current.hintsShown, 1),
      results: null,
      view: "hint",
    }));
  };

  const showSolution = () => {
    if (!state.solved && !state.burned) {
      recordAttempts([
        { taskId, slot, correct: false, source: "practice", helpLevel: 3 },
      ]);
      if (historyEntryId.current) {
        markTaskHistoryHelp(historyEntryId.current, 3);
      } else {
        historyEntryId.current =
          recordTaskHistory([
            {
              taskId,
              slot,
              source: "practice",
              outcome: "incorrect",
              answers: state.answers,
              helpLevel: 3,
            },
          ])[0]?.id ?? null;
      }
    }
    setState((current) => ({
      ...current,
      attempted: true,
      burned: current.solved ? false : true,
      dirty: false,
      results: null,
      view: "solution",
    }));
  };

  const nextHelp = () => {
    if (state.hintsShown < hintsHtml.length) {
      const helpLevel = state.hintsShown + 1;
      recordHelp(helpLevel);
      if (historyEntryId.current) {
        markTaskHistoryHelp(historyEntryId.current, helpLevel);
      }
      setState((current) => ({
        ...current,
        hintsShown: current.hintsShown + 1,
      }));
      return;
    }
    showSolution();
  };

  return (
    <section className="mt-8 space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
        aria-busy={checking}
        className="space-y-3"
      >
        {check.map((part, index) => (
          <AnswerField
            key={`${part.label ?? part.kind}-${index}`}
            part={part}
            index={index}
            value={state.answers[index]}
            result={state.results?.[index] ?? null}
            disabled={locked || checking}
            onChange={(value) => {
              setState((current) => ({
                ...current,
                answers: current.answers.with(index, value),
                results: null,
                dirty: true,
                view: "form",
              }));
            }}
          />
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={locked || checking}
            className="min-h-12 rounded-lg bg-brand px-6 py-3 font-medium text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
          >
            {checking ? t("checkingCta") : t("checkCta")}
          </button>
          {!locked &&
            hintsHtml.length > 0 &&
            (state.attempted ? (
              state.view === "form" && (
                <button
                  type="button"
                  onClick={showHint}
                  className="text-sm text-zinc-600 underline hover:text-zinc-900"
                >
                  {t("showHint")}
                </button>
              )
            ) : (
              <p className="text-sm text-zinc-500">{t("hintLockedNote")}</p>
            ))}
        </div>
        {checkerUnavailable && (
          <p role="alert" className="text-sm text-red-700">
            {t("checkerUnavailable")}
          </p>
        )}
      </form>

      <div aria-live="polite">
        {state.view === "incorrect" && (
          <FeedbackCard tone="red" title={t("incorrectTitle")}>
            <p>{t("incorrectBody")}</p>
            <div className="flex flex-wrap gap-3">
              <CardButton
                onClick={() =>
                  setState((current) => ({ ...current, view: "form" }))
                }
              >
                {t("retry")}
              </CardButton>
              {hintsHtml.length > 0 ? (
                <CardButton onClick={showHint}>{t("showHint")}</CardButton>
              ) : (
                <CardButton onClick={showSolution}>
                  {t("showFullSolution")}
                </CardButton>
              )}
            </div>
          </FeedbackCard>
        )}

        {state.view === "hint" && (
          <FeedbackCard
            tone="amber"
            title={t("hintTitle", { level: state.hintsShown })}
          >
            {hintsHtml.slice(0, state.hintsShown).map((html, index) => (
              <RenderedMarkdown
                key={index}
                html={html}
                openImageLabel={t("openImage")}
                closeImageLabel={t("closeImage")}
              />
            ))}
            <div className="flex flex-wrap gap-3">
              <CardButton onClick={nextHelp}>
                {state.hintsShown < hintsHtml.length
                  ? t("nextHint")
                  : t("showFullSolution")}
              </CardButton>
              <CardButton
                onClick={() =>
                  setState((current) => ({ ...current, view: "form" }))
                }
              >
                {t("backToSolving")}
              </CardButton>
            </div>
          </FeedbackCard>
        )}

        {state.view === "solution" && (
          <FeedbackCard tone="violet" title={t("solutionTitle")}>
            <RenderedMarkdown
              html={solutionHtml}
              openImageLabel={t("openImage")}
              closeImageLabel={t("closeImage")}
            />
            {nextTaskHref && (
              <Link
                href={nextTaskHref}
                className="inline-flex min-h-12 items-center rounded-lg bg-brand px-6 py-3 font-medium text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {t("nextTask")}
              </Link>
            )}
          </FeedbackCard>
        )}

        {state.view === "correct" && (
          <FeedbackCard tone="green" title={t("correctTitle")}>
            <p>{t("correctBody")}</p>
            <div className="flex flex-wrap items-center gap-3">
              {nextTaskHref && (
                <Link
                  href={nextTaskHref}
                  className="inline-flex min-h-12 items-center rounded-lg bg-brand px-6 py-3 font-medium text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {t("nextTask")}
                </Link>
              )}
              <CardButton
                onClick={() =>
                  setState((current) => ({ ...current, view: "solution" }))
                }
              >
                {t("viewSolution")}
              </CardButton>
            </div>
          </FeedbackCard>
        )}
      </div>
    </section>
  );
}
