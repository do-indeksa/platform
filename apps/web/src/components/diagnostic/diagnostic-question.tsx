"use client";

import { LoaderCircle, Send, SkipForward, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { AnswerField } from "@/components/task-check/answer-field";
import { Link, useRouter } from "@/i18n/navigation";
import { trackTaskSolved } from "@/lib/analytics";
import {
  abandonCurrentDiagnosticRun,
  finishDiagnosticCloudUpload,
  scheduleDiagnosticCloudUpload,
} from "@/lib/diagnostic-cloud-sync";
import { persistCompletedDiagnosticRun } from "@/lib/diagnostic-progress";
import { useDiagnostic } from "@/lib/diagnostic-store";
import { recordTaskHistory } from "@/lib/task-history-store";
import { DiagnosticCloudStatus } from "./diagnostic-cloud-status";
import type { DiagnosticTaskView } from "./types";

export function DiagnosticQuestion({
  tasks,
  blueprintVersion,
  contentRevision,
}: {
  tasks: DiagnosticTaskView[];
  blueprintVersion: string;
  contentRevision: string;
}) {
  const t = useTranslations("diagnostic");
  const router = useRouter();
  const diagnostic = useDiagnostic();
  const currentIndex = diagnostic.currentIndex;
  const answers = diagnostic.answers[currentIndex] ?? [];
  const [submitting, setSubmitting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPositionKey = useRef<string | null>(null);
  const task = tasks[currentIndex];
  const progress = ((currentIndex + 1) / tasks.length) * 100;
  const syncTasks = useMemo(
    () =>
      tasks.map(({ id, revision, slot, examPosition, topic, fields }) => ({
        id,
        revision,
        slot,
        examPosition,
        topic,
        answerPartCount: fields.length,
      })),
    [tasks],
  );

  useEffect(() => {
    if (diagnostic.phase !== "running" || diagnostic.runId === null) return;
    const positionKey = JSON.stringify({
      runId: diagnostic.runId,
      currentIndex: diagnostic.currentIndex,
      outcomes: diagnostic.outcomes.slice(0, diagnostic.currentIndex),
    });
    const immediate = lastPositionKey.current !== positionKey;
    lastPositionKey.current = positionKey;
    scheduleDiagnosticCloudUpload(
      {
        state: diagnostic,
        tasks: syncTasks,
        blueprintVersion,
        contentRevision,
      },
      immediate,
    );
  }, [blueprintVersion, contentRevision, diagnostic, syncTasks]);

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
      complete(result.outcome);
    } catch {
      setError(t("checkUnavailable"));
    } finally {
      setSubmitting(false);
    }
  };

  const complete = (outcome: "correct" | "incorrect" | "skipped") => {
    diagnostic.completeCurrent(task.id, outcome);
    const state = useDiagnostic.getState();
    if (state.phase === "done") {
      finishDiagnosticCloudUpload(state.runId as string);
      persistCompletedDiagnosticRun(
        state,
        syncTasks,
        blueprintVersion,
        contentRevision,
      );
    }
  };

  const abandon = async () => {
    if (!confirm(t("abandonConfirm"))) return;
    const runId = useDiagnostic.getState().runId;
    if (runId === null) return;
    setAbandoning(true);
    setError(null);
    const abandoned = await abandonCurrentDiagnosticRun(runId);
    if (abandoned) {
      useDiagnostic.getState().reset();
      router.push("/diagnostic");
    } else {
      setError(t("abandonUnavailable"));
      setAbandoning(false);
    }
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
            disabled={abandoning}
            onClick={() => void abandon()}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            {abandoning ? (
              <LoaderCircle
                aria-hidden="true"
                className="h-5 w-5 animate-spin"
              />
            ) : (
              <X aria-hidden="true" className="h-5 w-5" />
            )}
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
            <span className="flex flex-col items-end gap-1 tabular-nums text-muted">
              <span>
                {currentIndex + 1} / {tasks.length}
              </span>
              <DiagnosticCloudStatus />
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
                disabled={submitting || abandoning}
                onChange={(value) => {
                  setError(null);
                  diagnostic.setAnswer(currentIndex, index, value);
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
              disabled={submitting || abandoning}
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
              disabled={submitting || abandoning}
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
                complete("skipped");
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
