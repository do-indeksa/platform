"use client";

import { LoaderCircle, Send, SkipForward, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { AnswerField } from "@/components/task-check/answer-field";
import { Link, useRouter } from "@/i18n/navigation";
import { trackTaskSolved } from "@/lib/analytics";
import { useDiagnostic } from "@/lib/diagnostic-store";
import { recordTaskHistory } from "@/lib/task-history-store";
import type { DiagnosticTaskView } from "./types";

export function DiagnosticQuestion({ tasks }: { tasks: DiagnosticTaskView[] }) {
  const t = useTranslations("diagnostic");
  const router = useRouter();
  const currentIndex = useDiagnostic((state) => state.currentIndex);
  const answers = useDiagnostic((state) => state.answers[currentIndex] ?? []);
  const setAnswer = useDiagnostic((state) => state.setAnswer);
  const completeCurrent = useDiagnostic((state) => state.completeCurrent);
  const reset = useDiagnostic((state) => state.reset);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = tasks[currentIndex];
  const progress = ((currentIndex + 1) / tasks.length) * 100;

  const submit = async () => {
    if (submitting) return;
    if (answers.some((answer) => answer.trim() === "")) {
      setError(t("invalidAnswer"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/content/diagnostic-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          topic: task.topic,
          answers,
        }),
      });
      if (!response.ok) throw new Error(`check failed: ${response.status}`);
      const result = (await response.json()) as { outcome?: unknown };
      if (result.outcome === "invalid") {
        setError(t("invalidAnswer"));
        return;
      }
      if (result.outcome !== "correct" && result.outcome !== "incorrect") {
        throw new Error("invalid check response");
      }
      recordTaskHistory([
        {
          taskId: task.id,
          slot: task.slot,
          source: "diagnostic",
          outcome: result.outcome,
          answers,
          helpLevel: 0,
        },
      ]);
      if (result.outcome === "correct") {
        trackTaskSolved({
          source: "diagnostic",
          position: task.examPosition,
        });
      }
      completeCurrent(task.id, result.outcome);
    } catch {
      setError(t("checkUnavailable"));
    } finally {
      setSubmitting(false);
    }
  };

  const abandon = () => {
    if (!confirm(t("abandonConfirm"))) return;
    reset();
    router.push("/diagnostic");
  };

  return (
    <main className="min-h-dvh bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="text-lg font-bold text-brand-ink">
            Do indeksa
          </Link>
          <button
            type="button"
            title={t("abandon")}
            aria-label={t("abandon")}
            onClick={abandon}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
        <div className="mb-9">
          <div className="mb-3 flex items-center justify-between gap-4 text-sm font-medium">
            <span>
              {t("progress", {
                current: currentIndex + 1,
                total: tasks.length,
              })}
            </span>
            <span className="tabular-nums text-muted">
              {currentIndex + 1} / {tasks.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div
              role="progressbar"
              aria-label={t("progress", {
                current: currentIndex + 1,
                total: tasks.length,
              })}
              aria-valuemin={1}
              aria-valuemax={tasks.length}
              aria-valuenow={currentIndex + 1}
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <section aria-labelledby="diagnostic-task-heading">
          <p className="mb-3 text-sm font-semibold text-brand-ink">
            {t("positionLabel", { position: task.examPosition })} ·{" "}
            {task.topicName}
          </p>
          <h1 id="diagnostic-task-heading" className="sr-only">
            {t("taskHeading", { position: task.examPosition })}
          </h1>
          <RenderedMarkdown
            html={task.statementHtml}
            openImageLabel={t("openImage")}
            closeImageLabel={t("closeImage")}
            className="text-lg leading-8 sm:text-xl sm:leading-9"
          />

          <div className="mt-9 space-y-5 border-t border-line pt-7">
            {task.fields.map((field, index) => (
              <AnswerField
                key={`${task.id}-${index}`}
                part={field}
                index={index}
                value={answers[index] ?? ""}
                result={null}
                disabled={submitting}
                onChange={(value) => {
                  setError(null);
                  setAnswer(currentIndex, index, value);
                }}
              />
            ))}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin"
                />
              ) : (
                <Send aria-hidden="true" className="h-5 w-5" />
              )}
              {submitting ? t("submitting") : t("submitAnswer")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setError(null);
                recordTaskHistory([
                  {
                    taskId: task.id,
                    slot: task.slot,
                    source: "diagnostic",
                    outcome: "skipped",
                    answers,
                    helpLevel: 0,
                  },
                ]);
                completeCurrent(task.id, "skipped");
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 px-4 py-3 font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              <SkipForward aria-hidden="true" className="h-5 w-5" />
              {t("skipTask")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
