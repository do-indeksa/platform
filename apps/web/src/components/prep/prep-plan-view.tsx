"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useUser } from "@/components/user-provider";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { useAttempts } from "@/lib/attempts-store";
import type { TaskReference } from "@/lib/content";
import { useDiagnostic, useDiagnosticOwnerKnown } from "@/lib/diagnostic-store";
import { useHistoryRuns } from "@/lib/history-run-store";
import { prepDiagnosticCompletion } from "@/lib/prep-diagnostic-completion";
import {
  buildPrepPlan,
  prepPracticeTaskCount,
  type PrepAction,
  type PrepPositionDefinition,
  type PrepTopicSlot,
} from "@/lib/prep-plan";
import { taskPracticeHref } from "@/lib/task-bank";
import { useHydrated } from "@/lib/use-hydrated";
import { PrepPlanFacts } from "./prep-plan-facts";
import { PrepPlanLoading } from "./prep-plan-loading";
import { PrepPlanSummary } from "./prep-plan-summary";
import { PrepPlanTabs, type PrepPlanViewMode } from "./prep-plan-tabs";
import { PrepPositionList } from "./prep-position-list";
import { PrepSettingsDialog } from "./prep-settings-dialog";
import { PrepWeekView } from "./prep-week-view";
import { usePrepPreferences } from "./use-prep-preferences";

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
  const locale = useLocale() as AppLocale;
  const { user, loading: ownerLoading } = useUser();
  const ownerId = ownerLoading ? undefined : (user?.id ?? null);
  const attempts = useAttempts();
  const runSnapshot = useHistoryRuns();
  const hydrated = useHydrated();
  const diagnosticOwnerKnown = useDiagnosticOwnerKnown();
  const diagnosticPhase = useDiagnostic((state) => state.phase);
  const diagnosticCompletedAt = useDiagnostic((state) =>
    state.phase === "done" ? (state.completedAt.at(-1) ?? null) : null,
  );
  const {
    preferences: { goalPoints, examDate },
    ready: preferencesReady,
    hydrationId: preferencesHydrationId,
    setPreferences,
  } = usePrepPreferences(ownerId);
  const [settingsDialog, setSettingsDialog] = useState({
    hydrationId: null as number | null,
    open: false,
  });
  const settingsOpen =
    preferencesReady &&
    preferencesHydrationId === settingsDialog.hydrationId &&
    settingsDialog.open;
  const setSettingsOpen = (open: boolean) =>
    setSettingsDialog({ hydrationId: preferencesHydrationId, open });
  const [viewMode, setViewMode] = useState<PrepPlanViewMode>("positions");

  const day = useCurrentDay();
  const daysUntilExam = examDate
    ? calendarDaysBetween(day.key, examDate)
    : null;
  const settingsComplete =
    goalPoints !== null &&
    examDate !== null &&
    daysUntilExam !== null &&
    daysUntilExam >= 0;
  const diagnosticCompletion = prepDiagnosticCompletion({
    localPhase: diagnosticPhase,
    localCompletedAt: diagnosticCompletedAt,
    latestSubmittedDiagnostic: runSnapshot?.latestSubmittedDiagnostic ?? null,
    dayStartMs: day.startMs,
    dayEndMs: day.endMs,
  });

  if (
    !hydrated ||
    attempts === null ||
    runSnapshot === null ||
    !diagnosticOwnerKnown ||
    !preferencesReady
  ) {
    return <PrepPlanLoading positions={positions} />;
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
    diagnosticCompleted: diagnosticCompletion.completed,
    diagnosticCompletedToday: diagnosticCompletion.completedToday,
  });
  const taskById = new Map(taskReferences.map((task) => [task.id, task]));
  const formattedExamDate = examDate
    ? new Intl.DateTimeFormat(htmlLanguage(locale), {
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
  const nextActionHref = plan.nextAction ? hrefFor(plan.nextAction) : "/tasks";
  const visiblePositions =
    viewMode === "topics"
      ? plan.positions.toSorted((left, right) =>
          left.name.localeCompare(right.name, htmlLanguage(locale)),
        )
      : plan.positions;

  return (
    <main
      data-testid="prep-plan"
      data-state="ready"
      aria-busy="false"
      className="mx-auto w-full max-w-[1304px] px-4 pt-4 pb-6 lg:px-8 lg:pt-[26px] lg:pb-12"
    >
      <div className="flex min-w-0 flex-col gap-3.5 lg:gap-4">
        <header className="min-w-0">
          <h1 className="text-[22px] leading-[30px] font-semibold text-ink lg:text-[32px] lg:leading-10 lg:font-bold">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm leading-5 text-muted">
            {t("subtitle", { count: positions.length })}
          </p>
        </header>

        <PrepPlanSummary
          readiness={plan.readiness}
          covered={plan.coveredPositions}
          total={positions.length}
          goalPoints={goalPoints}
          maxPoints={maxPoints}
          daysUntilExam={daysUntilExam}
          formattedExamDate={formattedExamDate}
          onEdit={() => setSettingsOpen(true)}
        />

        <PrepPlanTabs
          value={viewMode}
          total={positions.length}
          onChange={setViewMode}
        />

        <div
          id="prep-plan-panel"
          role="tabpanel"
          aria-labelledby={`prep-plan-tab-${viewMode}`}
        >
          {viewMode === "week" ? (
            <PrepWeekView
              actions={plan.todayActions}
              nextAction={plan.nextAction}
              nextActionHref={nextActionHref}
              hrefFor={hrefFor}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <PrepPositionList positions={visiblePositions} mode={viewMode} />
          )}
        </div>

        <PrepPlanFacts
          nextAction={plan.nextAction}
          nextActionHref={nextActionHref}
          actions={plan.todayActions}
          formattedExamDate={formattedExamDate}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

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
