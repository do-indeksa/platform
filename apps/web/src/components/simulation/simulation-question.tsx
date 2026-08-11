"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, SkipForward } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { AnswerField } from "@/components/task-check/answer-field";
import { useRouter } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import {
  abandonCurrentSimulationRun,
  scheduleSimulationCloudUpload,
} from "@/lib/simulation-cloud-sync";
import { useRemainingSeconds } from "@/lib/use-countdown";
import { useSimulation } from "@/lib/simulation-store";
import {
  simulationTaskStatus,
  type SimulationProgressItem,
} from "@/lib/simulation-types";
import { SimulationCloudStatus } from "./simulation-cloud-status";
import { SimulationFinishDialog } from "./simulation-finish-dialog";
import { SimulationHeader } from "./simulation-header";

export function SimulationQuestion({
  onSubmit,
  syncTasks,
  blueprintVersion,
  contentRevision,
}: {
  onSubmit: (timedOut: boolean) => void;
  syncTasks: readonly SimulationProgressItem[];
  blueprintVersion: string;
  contentRevision: string;
}) {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const router = useRouter();
  const simulation = useSimulation();
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
  } = simulation;
  const remainingSeconds = useRemainingSeconds(endsAt);
  const timeoutHandled = useRef(false);
  const lastPositionKey = useRef<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState(false);
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
    if (simulation.phase !== "running" || simulation.runId === null) return;
    const positionKey = JSON.stringify({
      runId: simulation.runId,
      currentIndex: simulation.currentIndex,
      skipped: simulation.skipped,
    });
    const immediate = lastPositionKey.current !== positionKey;
    lastPositionKey.current = positionKey;
    scheduleSimulationCloudUpload(
      {
        state: simulation,
        tasks: syncTasks,
        blueprintVersion,
        contentRevision,
      },
      immediate,
    );
  }, [blueprintVersion, contentRevision, simulation, syncTasks]);

  useEffect(() => {
    if (remainingSeconds === 0 && !timeoutHandled.current) {
      timeoutHandled.current = true;
      onSubmit(true);
    }
  }, [onSubmit, remainingSeconds]);

  const abandon = async () => {
    if (abandoning) return;
    if (!window.confirm(t("abandonConfirm"))) return;
    const runId = useSimulation.getState().runId;
    if (runId === null) return;
    setAbandoning(true);
    setAbandonError(false);
    const abandoned = await abandonCurrentSimulationRun(runId);
    if (abandoned) {
      reset();
      router.push("/simulation");
      return;
    }
    setAbandonError(true);
    setAbandoning(false);
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
        onAbandon={() => void abandon()}
        disabled={abandoning}
        abandoning={abandoning}
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
                  disabled={abandoning}
                  onChange={(value) => setAnswer(currentIndex, index, value)}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p
                aria-live="polite"
                className="flex items-center gap-2 text-xs leading-5 text-muted"
              >
                <CheckCircle2
                  aria-hidden
                  className="h-4 w-4 text-emerald-600"
                />
                {savedAt
                  ? t("savedAt", {
                      time: new Intl.DateTimeFormat(
                        htmlLanguage(locale as AppLocale),
                        { hour: "2-digit", minute: "2-digit" },
                      ).format(savedAt),
                    })
                  : t("autosaveReady")}
              </p>
              <SimulationCloudStatus />
            </div>
            {abandonError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {t("abandonUnavailable")}
              </p>
            )}
          </div>

          <div className="mt-9 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={currentIndex === 0 || abandoning}
              onClick={() => goTo(currentIndex - 1)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line px-5 font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft aria-hidden className="h-5 w-5" />
              {t("previousTask")}
            </button>
            <button
              type="button"
              disabled={abandoning}
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
              disabled={abandoning}
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
