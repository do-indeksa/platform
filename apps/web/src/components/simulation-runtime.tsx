"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { MarkButton } from "@/components/mark-button";
import { POINTS_PER_TASK, simulationScore } from "@/lib/scoring";
import {
  useSimulation,
  type RunKind,
  type SimulationTask,
} from "@/lib/simulation-store";
import { useRemainingSeconds } from "@/lib/use-countdown";
import { useHydrated } from "@/lib/use-hydrated";

const RUNS = {
  simulation: {
    home: "/simulation",
    resumePath: "/simulation/new",
    activeKey: "simulationActive",
    resumeKey: "resumeSimulation",
    abandonConfirmKey: "abandonConfirm",
  },
  diagnostic: {
    home: "/diagnostic",
    resumePath: "/diagnostic/new",
    activeKey: "diagnosticActive",
    resumeKey: "resumeDiagnostic",
    abandonConfirmKey: "abandonConfirmDiagnostic",
  },
} as const satisfies Record<RunKind, unknown>;

export function SimulationRuntime({
  variantId,
  tasks,
  kind,
}: {
  variantId: string;
  tasks: SimulationTask[];
  kind: RunKind;
}) {
  const t = useTranslations("simulation");
  const phase = useSimulation((state) => state.phase);
  const activeKind = useSimulation((state) => state.kind);
  const start = useSimulation((state) => state.start);
  const hydrated = useHydrated();
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || startedRef.current === variantId) return;
    startedRef.current = variantId;
    const state = useSimulation.getState();
    if (state.phase === null) {
      start(tasks, kind);
    } else if (state.kind !== kind && state.phase === "done") {
      state.reset();
      start(tasks, kind);
    }
  }, [hydrated, variantId, start, tasks, kind]);

  if (
    !hydrated ||
    phase === null ||
    (activeKind !== kind && phase === "done")
  ) {
    return <p className="animate-pulse text-zinc-500">{t("assembling")}</p>;
  }
  if (activeKind !== kind) return <OtherRunNotice activeKind={activeKind} />;
  if (phase === "running") return <ExamPhase />;
  if (phase === "grading") return <GradingPhase />;
  return kind === "simulation" ? <ExamResult /> : <DiagnosticResult />;
}

function OtherRunNotice({ activeKind }: { activeKind: RunKind }) {
  const t = useTranslations("simulation");
  const run = RUNS[activeKind];
  return (
    <div className="space-y-4">
      <p className="text-zinc-600">{t(run.activeKey)}</p>
      <Link
        href={run.resumePath}
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        {t(run.resumeKey)}
      </Link>
    </div>
  );
}

function AbandonButton() {
  const t = useTranslations("simulation");
  const kind = useSimulation((state) => state.kind);
  const reset = useSimulation((state) => state.reset);
  const router = useRouter();
  const run = RUNS[kind];
  return (
    <button
      onClick={() => {
        if (!confirm(t(run.abandonConfirmKey))) return;
        reset();
        router.push(run.home);
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
        {task.slot}. {task.topicName}
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
            {task.slot}. {task.topicName}
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
  const score = simulationScore(marks);

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-zinc-900 p-6 text-center text-white">
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
              {task.slot}. {task.topicName}
            </span>
            <span className={marks[i] ? "text-green-700" : "text-red-600"}>
              {marks[i] ? `+${POINTS_PER_TASK}` : "0"}
            </span>
          </li>
        ))}
      </ul>
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

function DiagnosticResult() {
  const t = useTranslations("diagnostic");
  const { tasks, marks } = useSimulation();

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-zinc-900 p-6 text-center text-white">
        <span className="block text-3xl font-bold">{t("resultTitle")}</span>
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
              {task.slot}. {task.topicName}
            </span>
            <span className={marks[i] ? "text-green-700" : "text-red-600"}>
              {marks[i] ? t("correct") : t("incorrect")}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/prep"
        className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
      >
        {t("mapCta")}
      </Link>
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
