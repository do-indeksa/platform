"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { MarkButton } from "@/components/mark-button";
import { Link, useRouter } from "@/i18n/navigation";
import { diagnosticRunHref } from "@/lib/diagnostic-run";
import { useDiagnostic } from "@/lib/diagnostic-store";
import { binaryTrainerEstimate } from "@/lib/scoring";
import { useSimulation, type SimulationTask } from "@/lib/simulation-store";
import { useRemainingSeconds } from "@/lib/use-countdown";
import { useHydrated } from "@/lib/use-hydrated";

export function SimulationRuntime({
  variantId,
  tasks,
}: {
  variantId: string;
  tasks: SimulationTask[];
}) {
  const t = useTranslations("simulation");
  const phase = useSimulation((state) => state.phase);
  const start = useSimulation((state) => state.start);
  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticRunId = useDiagnostic((state) => state.runId);
  const diagnosticTaskIds = useDiagnostic((state) => state.taskIds);
  const hydrated = useHydrated();
  const startedRef = useRef<string | null>(null);
  const [startedId, setStartedId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || startedRef.current === variantId) return;
    if (
      diagnosticPhase === "running" &&
      useSimulation.getState().phase === null
    ) {
      return;
    }
    let cancelled = false;
    startedRef.current = variantId;
    const state = useSimulation.getState();
    if (state.phase === "done") state.reset();
    if (useSimulation.getState().phase === null) start(tasks);
    queueMicrotask(() => {
      if (!cancelled) setStartedId(variantId);
    });
    return () => {
      cancelled = true;
    };
  }, [diagnosticPhase, hydrated, start, tasks, variantId]);

  if (
    hydrated &&
    phase === null &&
    diagnosticPhase === "running" &&
    diagnosticRunId
  ) {
    return (
      <OtherRunNotice
        href={diagnosticRunHref(
          "/diagnostic/new",
          diagnosticRunId,
          diagnosticTaskIds,
        )}
      />
    );
  }

  if (
    !hydrated ||
    phase === null ||
    (phase === "done" && startedId !== variantId)
  ) {
    return <p className="animate-pulse text-zinc-500">{t("assembling")}</p>;
  }
  if (phase === "running") return <ExamPhase />;
  if (phase === "grading") return <GradingPhase />;
  return <ExamResult />;
}

function OtherRunNotice({ href }: { href: string }) {
  const t = useTranslations("simulation");
  return (
    <div className="space-y-4">
      <p className="text-zinc-600">{t("diagnosticActive")}</p>
      <Link
        href={href}
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        {t("resumeDiagnostic")}
      </Link>
    </div>
  );
}

function AbandonButton() {
  const t = useTranslations("simulation");
  const reset = useSimulation((state) => state.reset);
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (!confirm(t("abandonConfirm"))) return;
        reset();
        router.push("/simulation");
      }}
      className="text-sm text-zinc-500 hover:underline"
    >
      {t("abandon")}
    </button>
  );
}

function ExamPhase() {
  const t = useTranslations("simulation");
  const { tasks, currentIndex, endsAt, goTo, submit } = useSimulation();
  const remainingSeconds = useRemainingSeconds(endsAt);
  const task = tasks[currentIndex];

  useEffect(() => {
    if (remainingSeconds === 0) submit();
  }, [remainingSeconds, submit]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TaskNav
          count={tasks.length}
          currentIndex={currentIndex}
          onSelect={goTo}
        />
        <span className="font-mono text-lg tabular-nums">
          {formatDuration(remainingSeconds)}
        </span>
      </div>
      <p className="text-sm text-zinc-500">
        {task.examPosition}. {task.topicName}
      </p>
      <div dangerouslySetInnerHTML={{ __html: task.statementHtml }} />
      <div className="flex items-center gap-6">
        <button
          onClick={() => confirm(t("submitConfirm")) && submit()}
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {t("submit")}
        </button>
        <AbandonButton />
      </div>
    </div>
  );
}

function GradingPhase() {
  const t = useTranslations("simulation");
  const { tasks, marks, mark, finish } = useSimulation();
  const allMarked = marks.every((value) => value !== null);

  return (
    <div className="space-y-10">
      <p className="text-zinc-600">{t("gradingIntro")}</p>
      {tasks.map((task, i) => (
        <section
          key={task.id}
          className="space-y-3 border-b border-zinc-200 pb-8"
        >
          <h2 className="font-bold">
            {task.examPosition}. {task.topicName}
          </h2>
          <div dangerouslySetInnerHTML={{ __html: task.statementHtml }} />
          <details className="rounded-lg border border-zinc-200 p-4">
            <summary className="cursor-pointer select-none font-medium">
              {t("solution")}
            </summary>
            <div
              className="mt-3"
              dangerouslySetInnerHTML={{ __html: task.solutionHtml }}
            />
          </details>
          <div className="flex gap-2">
            <MarkButton
              active={marks[i] === true}
              onClick={() => mark(i, true)}
              className="border-green-600 text-green-700"
            >
              {t("correct")}
            </MarkButton>
            <MarkButton
              active={marks[i] === false}
              onClick={() => mark(i, false)}
              className="border-red-500 text-red-600"
            >
              {t("incorrect")}
            </MarkButton>
          </div>
        </section>
      ))}
      <div className="flex items-center gap-6">
        <button
          onClick={finish}
          disabled={!allMarked}
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
        >
          {t("finish")}
        </button>
        <AbandonButton />
      </div>
    </div>
  );
}

function ExamResult() {
  const t = useTranslations("simulation");
  const { tasks, marks, reset } = useSimulation();
  const router = useRouter();
  const score = binaryTrainerEstimate(
    marks,
    tasks.map((task) => task.maxPoints),
  );

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-zinc-900 p-6 text-center text-white">
        <span className="block text-sm font-medium text-zinc-300">
          {t("estimateLabel")}
        </span>
        <span className="block text-5xl font-bold">
          {t("scoreOf", { score })}
        </span>
        <span className="mt-1 block text-zinc-300">
          {t("correctSummary", {
            correct: marks.filter(Boolean).length,
            total: tasks.length,
          })}
        </span>
      </p>
      <ul className="space-y-1">
        {tasks.map((task, i) => (
          <li key={task.id} className="flex justify-between text-sm">
            <span>
              {task.examPosition}. {task.topicName}
            </span>
            <span className={marks[i] ? "text-green-700" : "text-red-600"}>
              {marks[i] ? `+${task.maxPoints}` : "0"}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-zinc-600">{t("estimateDisclaimer")}</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            reset();
            router.refresh();
          }}
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {t("restart")}
        </button>
        <Link
          href="/simulation"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:border-zinc-500"
        >
          {t("back")}
        </Link>
      </div>
    </div>
  );
}

function TaskNav({
  count,
  currentIndex,
  onSelect,
}: {
  count: number;
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("simulation");
  return (
    <nav aria-label={t("taskNav")} className="flex flex-wrap gap-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          aria-current={i === currentIndex ? "true" : undefined}
          className={`h-9 w-9 rounded-lg border text-sm transition-colors ${
            i === currentIndex
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 hover:border-zinc-500"
          }`}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
