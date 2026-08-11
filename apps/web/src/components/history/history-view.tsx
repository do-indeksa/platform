"use client";

import { Cloud, CloudOff, HardDrive, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAttemptJournal } from "@/lib/attempts-store";
import {
  mergeTaskHistory,
  recentHistoryErrorTaskIds,
} from "@/lib/history-journal";
import {
  isSimulationActive,
  useSimulation,
  useSimulationHistory,
} from "@/lib/simulation-store";
import { mergeSimulationArchive } from "@/lib/simulation-archive";
import { useSimulationArchive } from "@/lib/simulation-archive-store";
import { useTaskHistory } from "@/lib/task-history-store";
import { taskPracticeHref } from "@/lib/task-bank";
import { useHydrated } from "@/lib/use-hydrated";
import { TaskHistoryList } from "./task-history-list";
import type { HistoryTaskMeta } from "./types";
import { VariantHistoryList } from "./variant-history-list";

export type HistoryTab = "tasks" | "variants";

export function HistoryView({
  initialTab,
  tasks,
}: {
  initialTab: HistoryTab;
  tasks: HistoryTaskMeta[];
}) {
  const t = useTranslations("history");
  const hydrated = useHydrated();
  const localTaskEntries = useTaskHistory();
  const journal = useAttemptJournal();
  const localVariantEntries = useSimulationHistory();
  const archive = useSimulationArchive();
  const simulationPhase = useSimulation((state) => state.phase);
  const [practiceId] = useState(() => crypto.randomUUID());
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const taskEntries = useMemo(
    () =>
      localTaskEntries === null || journal === null
        ? null
        : mergeTaskHistory(localTaskEntries, journal.entries),
    [journal, localTaskEntries],
  );
  const variantEntries = useMemo(
    () =>
      archive === null || localVariantEntries === null
        ? null
        : mergeSimulationArchive(localVariantEntries, archive.entries),
    [archive, localVariantEntries],
  );

  if (
    !hydrated ||
    taskEntries === null ||
    journal === null ||
    variantEntries === null ||
    archive === null
  ) {
    return (
      <main className="mx-auto flex min-h-[32rem] w-full max-w-6xl items-center justify-center px-5 sm:px-8">
        <p className="flex items-center gap-3 text-muted">
          <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
          {t("loading")}
        </p>
      </main>
    );
  }

  const errorTaskIds = recentHistoryErrorTaskIds(taskEntries).filter((taskId) =>
    taskById.has(taskId),
  );
  const firstError = taskById.get(errorTaskIds[0] ?? "");
  const practiceHref = firstError
    ? taskPracticeHref(
        firstError,
        "/history?tab=tasks",
        errorTaskIds,
        practiceId,
      )
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-9 pb-28 sm:px-8 sm:pt-14 md:pb-16">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-brand-ink">{t("kicker")}</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          {t("intro")}
        </p>
        <SyncNotice
          status={initialTab === "tasks" ? journal.status : archive.status}
          kind={initialTab}
        />
      </header>

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="mt-9 flex items-center gap-2 border-b border-line pb-4"
      >
        <HistoryTabLink
          href="/history"
          active={initialTab === "tasks"}
          label={t("tasksTab")}
        />
        <HistoryTabLink
          href="/history?tab=variants"
          active={initialTab === "variants"}
          label={t("variantsTab")}
        />
      </div>

      <section
        role="tabpanel"
        aria-label={t(initialTab === "tasks" ? "tasksTab" : "variantsTab")}
        className="pt-4"
      >
        {initialTab === "tasks" ? (
          <TaskHistoryList
            entries={taskEntries}
            taskById={taskById}
            practiceHref={practiceHref}
            errorCount={errorTaskIds.length}
          />
        ) : (
          <VariantHistoryList entries={variantEntries} />
        )}
      </section>

      {isSimulationActive(simulationPhase) && initialTab === "variants" && (
        <p className="mt-6 text-sm leading-6 text-muted">
          {t("activeVariantNotice")}
        </p>
      )}
    </main>
  );
}

function SyncNotice({
  status,
  kind,
}: {
  status: "guest" | "synced" | "degraded";
  kind: HistoryTab;
}) {
  const t = useTranslations("history");
  const Icon =
    status === "guest" ? HardDrive : status === "synced" ? Cloud : CloudOff;
  return (
    <p className="mt-5 flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      {t(
        kind === "tasks"
          ? `syncNotice.${status}`
          : `variantSyncNotice.${status}`,
      )}
    </p>
  );
}

function HistoryTabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      role="tab"
      aria-selected={active}
      href={href}
      className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "bg-brand text-on-brand"
          : "border border-line bg-surface text-ink hover:border-brand hover:text-brand-ink"
      }`}
    >
      {label}
    </Link>
  );
}
