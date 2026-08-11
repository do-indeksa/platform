"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, LoaderCircle, Target } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { useAttempts } from "@/lib/attempts-store";
import type { TaskReference } from "@/lib/content";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import {
  buildPrepPlan,
  prepPracticeTaskCount,
  type PrepAction,
  type PrepPositionDefinition,
  type PrepTopicSlot,
} from "@/lib/prep-plan";
import { usePrepSettings } from "@/lib/prep-settings";
import { taskPracticeHref } from "@/lib/task-bank";
import { useHydrated } from "@/lib/use-hydrated";
import { NextActionCard, TodayPlan } from "./prep-action-list";
import { PrepPositionList } from "./prep-position-list";
import { GuestOffer, ReadinessCard } from "./prep-readiness-card";
import { PrepSettingsDialog } from "./prep-settings-dialog";

const DAY_MS = 24 * 60 * 60 * 1000;

export function PrepPlanView({
  positions,
  topicSlots,
  taskReferences,
  maxPoints,
}: {
  positions: PrepPositionDefinition[];
  topicSlots: PrepTopicSlot[];
  taskReferences: TaskReference[];
  maxPoints: number;
}) {
  const t = useTranslations("prep");
  const locale = useLocale();
  const pathname = usePathname();
  const attempts = useAttempts();
  const hydrated = useHydrated();
  const { user, loading: userLoading } = useUser();
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticStartedAt = useDiagnostic((state) => state.startedAt);
  const goalPoints = usePrepSettings((state) => state.goalPoints);
  const examDate = usePrepSettings((state) => state.examDate);
  const setPreferences = usePrepSettings((state) => state.setPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const day = useCurrentDay();
  const daysUntilExam = examDate
    ? calendarDaysBetween(day.key, examDate)
    : null;
  const settingsComplete =
    goalPoints !== null &&
    examDate !== null &&
    daysUntilExam !== null &&
    daysUntilExam >= 0;
  const diagnosticCompletedToday =
    diagnosticPhase === "done" &&
    diagnosticStartedAt !== null &&
    diagnosticStartedAt >= day.startMs &&
    diagnosticStartedAt < day.endMs;

  if (!hydrated || attempts === null || !diagnosticOwnerKnown) {
    return <PrepLoading />;
  }

  const plan = buildPrepPlan({
    attempts,
    positions,
    topicSlots,
    taskReferences,
    dayStartMs: day.startMs,
    dayEndMs: day.endMs,
    settingsComplete,
    practiceTaskCount: prepPracticeTaskCount({
      goalPoints,
      maxPoints,
      daysUntilExam,
    }),
    diagnosticCompleted: diagnosticPhase === "done",
    diagnosticCompletedToday,
  });
  const taskById = new Map(taskReferences.map((task) => [task.id, task]));
  const formattedExamDate = examDate
    ? new Intl.DateTimeFormat(htmlLanguage(locale as AppLocale), {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parseLocalDate(examDate))
    : null;
  const hrefFor = (action: PrepAction): string => {
    if (action.kind === "diagnostic") return "/diagnostic";
    const firstTask = action.taskIds
      .map((taskId) => taskById.get(taskId))
      .find((task) => task !== undefined);
    return taskPracticeHref(firstTask, "/prep", action.taskIds);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-brand-ink">{t("kicker")}</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          {t("intro")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <PreferenceChip icon={Target} onClick={() => setSettingsOpen(true)}>
            {goalPoints === null
              ? t("goalUnset")
              : t("goalChip", { goal: goalPoints, max: maxPoints })}
          </PreferenceChip>
          <PreferenceChip
            icon={CalendarDays}
            onClick={() => setSettingsOpen(true)}
          >
            {examDate === null
              ? t("dateUnset")
              : daysUntilExam !== null && daysUntilExam < 0
                ? t("datePassed", { date: formattedExamDate ?? examDate })
                : t("dateChip", {
                    date: formattedExamDate ?? examDate,
                    days: daysUntilExam ?? 0,
                  })}
          </PreferenceChip>
        </div>
      </header>

      <div className="mt-9 grid items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)] lg:gap-10">
        <div className="min-w-0">
          <NextActionCard
            action={plan.nextAction}
            href={plan.nextAction ? hrefFor(plan.nextAction) : "/tasks"}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <TodayPlan
            actions={plan.todayActions}
            nextActionId={plan.nextAction?.id ?? null}
            hrefFor={hrefFor}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        <aside className="space-y-7">
          <ReadinessCard
            readiness={plan.readiness}
            covered={plan.coveredPositions}
            total={positions.length}
          />
          {!userLoading && user === null && <GuestOffer pathname={pathname} />}
        </aside>
      </div>

      <PrepPositionList positions={plan.positions} />
      <PrepSettingsDialog
        open={settingsOpen}
        preferences={{ goalPoints, examDate }}
        maxPoints={maxPoints}
        minDate={day.key}
        onClose={() => setSettingsOpen(false)}
        onSave={(preferences) => {
          setPreferences(preferences);
          setSettingsOpen(false);
        }}
      />
    </main>
  );
}

function PreferenceChip({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Target;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Icon aria-hidden className="h-4 w-4 text-brand" />
      {children}
    </button>
  );
}

function PrepLoading() {
  const t = useTranslations("prep");
  return (
    <main className="mx-auto flex min-h-[32rem] w-full max-w-6xl items-center justify-center px-5 sm:px-8">
      <p className="flex items-center gap-3 text-muted">
        <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
        {t("loading")}
      </p>
    </main>
  );
}

function currentDay(): { key: string; startMs: number; endMs: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    key: [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      String(start.getDate()).padStart(2, "0"),
    ].join("-"),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

function useCurrentDay(): ReturnType<typeof currentDay> {
  const [day, setDay] = useState(currentDay);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDay(currentDay()),
      Math.max(1_000, day.endMs - Date.now() + 100),
    );
    return () => window.clearTimeout(timeout);
  }, [day.endMs]);
  return day;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function calendarDaysBetween(from: string, to: string): number {
  const utc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}
