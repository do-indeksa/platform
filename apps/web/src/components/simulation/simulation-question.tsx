"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, SkipForward } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { AnswerField } from "@/components/task-check/answer-field";
import { useRouter } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { useRemainingSeconds } from "@/lib/use-countdown";
import { useSimulation } from "@/lib/simulation-store";
import { simulationTaskStatus } from "@/lib/simulation-types";
import { SimulationFinishDialog } from "./simulation-finish-dialog";
import { SimulationHeader } from "./simulation-header";

export function SimulationQuestion({
  onSubmit,
}: {
  onSubmit: (timedOut: boolean) => void;
}) {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const router = useRouter();
  const {
    tasks,
    answers,
    skipped,
    currentIndex,
    endsAt,
    savedAt,
    setAnswer,
    goTo,
    saveAndNext,
    skipCurrent,
    reset,
  } = useSimulation();
  const remainingSeconds = useRemainingSeconds(endsAt);
  const timeoutHandled = useRef(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const task = tasks[currentIndex];
  const statuses = answers.map((taskAnswers, index) =>
    simulationTaskStatus(taskAnswers, skipped[index]),
  );
  const unansweredCount = statuses.filter(
    (status) => status !== "answered",
  ).length;
  const skippedCount = statuses.filter((status) => status === "skipped").length;
  const lastTask = currentIndex === tasks.length - 1;

  useEffect(() => {
    if (remainingSeconds === 0 && !timeoutHandled.current) {
      timeoutHandled.current = true;
      onSubmit(true);
    }
  }, [onSubmit, remainingSeconds]);

  const abandon = () => {
    if (!window.confirm(t("abandonConfirm"))) return;
    reset();
    router.push("/simulation");
  };

  return (
    <main className="min-h-dvh bg-page">
      <SimulationHeader
        answers={answers}
        skipped={skipped}
        currentIndex={currentIndex}
        remainingSeconds={remainingSeconds}
        onSelect={goTo}
        onFinish={() => setFinishOpen(true)}
        onAbandon={abandon}
      />

      <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
        <section aria-labelledby="simulation-task-heading">
          <p className="text-sm font-semibold text-brand-ink">
            {t("positionLabel", { position: task.examPosition })} ·{" "}
            {task.topicName}
          </p>
          <h1 id="simulation-task-heading" className="mt-2 text-2xl font-bold">
            {t("taskHeading", {
              current: currentIndex + 1,
              total: tasks.length,
            })}
          </h1>
          <RenderedMarkdown
            html={task.statementHtml}
            openImageLabel={t("openImage")}
            closeImageLabel={t("closeImage")}
            className="mt-6 text-lg leading-8 sm:text-xl sm:leading-9"
          />

          <div className="mt-9 border-t border-line pt-7">
            <div className="space-y-5">
              {task.fields.map((field, index) => (
                <AnswerField
                  key={`${task.id}-${index}`}
                  part={field}
                  index={index}
                  value={answers[currentIndex][index]}
                  result={null}
                  disabled={false}
                  onChange={(value) => setAnswer(currentIndex, index, value)}
                />
              ))}
            </div>
            <p
              aria-live="polite"
              className="mt-4 flex items-center gap-2 text-xs leading-5 text-muted"
            >
              <CheckCircle2 aria-hidden className="h-4 w-4 text-emerald-600" />
              {savedAt
                ? t("savedAt", {
                    time: new Intl.DateTimeFormat(
                      htmlLanguage(locale as AppLocale),
                      { hour: "2-digit", minute: "2-digit" },
                    ).format(savedAt),
                  })
                : t("autosaveReady")}
            </p>
          </div>

          <div className="mt-9 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line px-5 font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft aria-hidden className="h-5 w-5" />
              {t("previousTask")}
            </button>
            <button
              type="button"
              onClick={() => {
                skipCurrent();
                if (lastTask) setFinishOpen(true);
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 px-4 font-medium text-muted hover:text-ink"
            >
              <SkipForward aria-hidden className="h-5 w-5" />
              {t("skipTask")}
            </button>
            <button
              type="button"
              onClick={() => {
                saveAndNext();
                if (lastTask) setFinishOpen(true);
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-on-brand hover:bg-brand-hover sm:ml-auto"
            >
              {lastTask ? t("saveAndReview") : t("saveAndNext")}
              <ArrowRight aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </section>
      </div>

      <SimulationFinishDialog
        open={finishOpen}
        unansweredCount={unansweredCount}
        skippedCount={skippedCount}
        onClose={() => setFinishOpen(false)}
        onFinish={() => onSubmit(false)}
      />
    </main>
  );
}
