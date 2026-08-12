"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAttemptJournal } from "@/lib/attempts-store";
import {
  buildHistoryFeed,
  filterHistoryFeed,
  hasHistoryFeedFilters,
  historyHref,
  historyTabs,
  type HistoryFeedFilters,
  type HistoryTab,
  type HistoryTaskMeta,
} from "@/lib/history-feed";
import {
  mergeTaskHistory,
  recentHistoryErrorTaskIds,
} from "@/lib/history-journal";
import { useHistoryRuns } from "@/lib/history-run-store";
import { mergeSimulationArchive } from "@/lib/simulation-archive";
import { useSimulationArchive } from "@/lib/simulation-archive-store";
import { useSimulationHistory } from "@/lib/simulation-store";
import { taskPracticeHref } from "@/lib/task-bank";
import { useTaskHistory } from "@/lib/task-history-store";
import { useHydrated } from "@/lib/use-hydrated";
import { HistoryFeedEmpty } from "./history-feed-empty";
import { HistoryFeedFilterControls } from "./history-feed-filters";
import { HistoryFeedList } from "./history-feed-list";
import { HistoryToolbarMenu } from "./history-toolbar-menu";
import { VariantScoreTrend } from "./variant-score-trend";

const DEFAULT_FILTERS: HistoryFeedFilters = {
  subject: "all",
  period: "all",
  difficulty: "all",
};

export type { HistoryTab } from "@/lib/history-feed";

export function HistoryView({
  initialTab,
  initialFilters,
  tasks,
}: {
  initialTab: HistoryTab;
  initialFilters: HistoryFeedFilters;
  tasks: HistoryTaskMeta[];
}) {
  const t = useTranslations("history.feed");
  const router = useRouter();
  const hydrated = useHydrated();
  const localTaskEntries = useTaskHistory();
  const journal = useAttemptJournal();
  const runSnapshot = useHistoryRuns();
  const localMocks = useSimulationHistory();
  const cloudMocks = useSimulationArchive();
  const [filters, setFilters] = useState(initialFilters);
  const [now] = useState(() => Date.now());
  const [showTrend, setShowTrend] = useState(false);
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
  const mocks = useMemo(
    () =>
      localMocks === null || cloudMocks === null
        ? null
        : mergeSimulationArchive(localMocks, cloudMocks.entries),
    [cloudMocks, localMocks],
  );
  const feed = useMemo(
    () =>
      taskEntries === null || runSnapshot === null || mocks === null
        ? null
        : buildHistoryFeed({
            attempts: taskEntries,
            runs: runSnapshot.entries,
            mocks,
            tasks,
          }),
    [mocks, runSnapshot, taskEntries, tasks],
  );
  const visible = useMemo(
    () =>
      feed === null
        ? null
        : filterHistoryFeed(feed, initialTab, filters, tasks, now),
    [feed, filters, initialTab, now, tasks],
  );

  if (
    !hydrated ||
    journal === null ||
    runSnapshot === null ||
    cloudMocks === null ||
    mocks === null ||
    feed === null ||
    visible === null
  ) {
    return (
      <main className="mx-auto flex min-h-[520px] w-full items-center justify-center px-4">
        <p className="flex items-center gap-2.5 text-sm text-muted">
          <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
          {t("loading")}
        </p>
      </main>
    );
  }

  const syncStatus = combinedSyncStatus(
    journal.status,
    runSnapshot.status,
    cloudMocks.status,
  );
  const errorTaskIds = recentHistoryErrorTaskIds(taskEntries ?? []).filter(
    (taskId) => taskById.has(taskId),
  );
  const firstError = taskById.get(errorTaskIds[0] ?? "");
  const practiceHref = firstError
    ? taskPracticeHref(
        firstError,
        historyHref("tasks", filters),
        errorTaskIds,
        practiceId,
      )
    : null;
  const filtered = hasHistoryFeedFilters(filters) || initialTab !== "all";
  const commitFilters = (next: HistoryFeedFilters) => {
    setFilters(next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${historyHref(initialTab, next).slice("/history".length)}`,
    );
  };
  const reset = () => commitFilters({ ...DEFAULT_FILTERS });
  const recoverFromEmpty = () => {
    if (initialTab === "all") {
      reset();
      return;
    }
    router.replace("/history");
  };

  return (
    <main
      data-testid="history-page"
      data-tab={initialTab}
      data-sync-status={syncStatus}
      data-design-status={syncStatus === "degraded" ? "provisional" : "figma"}
      className="min-h-[calc(100vh-64px)] w-full overflow-hidden rounded-b-2xl bg-page xl:min-h-[calc(100vh-72px)]"
    >
      <div
        data-testid="history-content"
        className="mx-auto w-[calc(100%_-_32px)] max-w-[1040px] pt-4 pb-10 md:w-[calc(100%_-_104px)] md:pt-[22px] xl:w-[1040px] xl:pt-7"
      >
        <h1 className="text-[22px] leading-[30px] font-semibold text-ink md:text-[32px] md:leading-10 md:font-bold">
          {t("title")}
        </h1>

        <nav
          aria-label={t("tabsLabel")}
          data-testid="history-tabs"
          className="mt-2 flex h-10 items-start gap-1 overflow-x-auto md:mt-3.5 md:h-[42px] md:gap-2"
        >
          {historyTabs.map((tab) => (
            <Link
              key={tab}
              href={historyHref(tab, filters)}
              aria-current={tab === initialTab ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center justify-center rounded-[9px] px-2.5 text-xs leading-4 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:px-[18px] ${
                tab === initialTab
                  ? "bg-subtle text-brand-ink"
                  : "border border-line bg-surface text-ink hover:border-brand"
              }`}
            >
              {t(`tabs.${tab}`)}
            </Link>
          ))}
        </nav>

        <div className="mt-3.5">
          <HistoryFeedFilterControls
            filters={filters}
            onChange={commitFilters}
            actions={
              <HistoryToolbarMenu
                canReset={hasHistoryFeedFilters(filters)}
                practiceHref={practiceHref}
                showTrend={mocks.length > 0}
                syncStatus={syncStatus}
                onReset={reset}
                onShowTrend={() => setShowTrend((value) => !value)}
              />
            }
          />
        </div>

        {syncStatus === "degraded" && (
          <p role="status" className="mt-2 text-xs leading-4 text-amber-700">
            {t("degraded")}
          </p>
        )}

        <section
          aria-label={t(`tabs.${initialTab}`)}
          className="mt-[22px] md:mt-3.5"
        >
          {visible.length === 0 ? (
            <HistoryFeedEmpty
              filtered={filtered && feed.length > 0}
              onReset={recoverFromEmpty}
            />
          ) : (
            <HistoryFeedList
              items={visible}
              taskById={taskById}
              returnTo={historyHref(initialTab, filters)}
            />
          )}
        </section>

        {showTrend && mocks.length > 0 && (
          <div className="mt-8" data-testid="history-trend-panel">
            <VariantScoreTrend entries={mocks} />
          </div>
        )}
      </div>
    </main>
  );
}

function combinedSyncStatus(
  ...statuses: ("guest" | "synced" | "degraded")[]
): "guest" | "synced" | "degraded" {
  if (statuses.includes("degraded")) return "degraded";
  return statuses.every((status) => status === "synced") ? "synced" : "guest";
}
