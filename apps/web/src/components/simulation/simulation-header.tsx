"use client";

import { Check, Clock3, Flag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { simulationTaskStatus } from "@/lib/simulation-types";

export function SimulationHeader({
  answers,
  skipped,
  currentIndex,
  remainingSeconds,
  onSelect,
  onFinish,
  onAbandon,
}: {
  answers: string[][];
  skipped: boolean[];
  currentIndex: number;
  remainingSeconds: number;
  onSelect: (index: number) => void;
  onFinish: () => void;
  onAbandon: () => void;
}) {
  const t = useTranslations("simulation");
  const lowTime = remainingSeconds <= 15 * 60;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto grid min-h-16 w-full max-w-7xl grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:gap-5 lg:px-8">
        <Link
          href="/"
          className="text-base font-bold text-brand-ink sm:text-lg"
        >
          Do indeksa
        </Link>
        <TaskNavigator
          answers={answers}
          skipped={skipped}
          currentIndex={currentIndex}
          onSelect={onSelect}
        />
        <span
          role="timer"
          aria-label={t("timeRemaining")}
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 font-mono text-sm font-semibold tabular-nums ${
            lowTime ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"
          }`}
        >
          <Clock3 aria-hidden className="h-4 w-4" />
          {formatCountdown(remainingSeconds)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:border-brand hover:text-brand-ink"
          >
            <Flag aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">{t("finishExam")}</span>
            <span className="sr-only sm:hidden">{t("finishExam")}</span>
          </button>
          <button
            type="button"
            onClick={onAbandon}
            title={t("abandon")}
            aria-label={t("abandon")}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function TaskNavigator({
  answers,
  skipped,
  currentIndex,
  onSelect,
}: {
  answers: string[][];
  skipped: boolean[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("simulation");
  return (
    <nav
      aria-label={t("taskNav")}
      className="order-last col-span-3 -mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 lg:order-none lg:col-span-1 lg:justify-center lg:pb-0"
    >
      {answers.map((taskAnswers, index) => {
        const status = simulationTaskStatus(taskAnswers, skipped[index]);
        const current = index === currentIndex;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            aria-current={current ? "step" : undefined}
            aria-label={t("taskNavLabel", {
              task: index + 1,
              status: t(`taskStatus.${status}`),
            })}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
              current
                ? "border-brand bg-brand text-on-brand"
                : status === "answered"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : status === "skipped"
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-line bg-surface text-muted hover:border-brand"
            }`}
          >
            {status === "answered" && !current ? (
              <Check aria-hidden className="h-4 w-4" />
            ) : (
              index + 1
            )}
          </button>
        );
      })}
    </nav>
  );
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
