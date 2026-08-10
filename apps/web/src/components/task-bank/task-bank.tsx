"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { TaskSummary, Topic } from "@/lib/content";
import { useAttempts } from "@/lib/attempts-store";
import {
  activeFilterCount,
  constrainTaskBankTopics,
  defaultTaskBankFilters,
  filterTaskSummaries,
  MAX_PRACTICE_SET_SIZE,
  serializeTaskBankState,
  taskBankHref,
  taskPracticeHref,
  type TaskBankFilters,
} from "@/lib/task-bank";
import { ActiveFilters } from "./active-filters";
import { FilterControls } from "./filter-controls";
import { MobileFilterDialog } from "./mobile-filter-dialog";
import { SelectionBar } from "./selection-bar";
import { TaskResults } from "./task-results";
import { useTaskBankScroll } from "./use-task-bank-scroll";

type TaskBankProps = {
  tasks: TaskSummary[];
  topics: Pick<Topic, "slug" | "slot">[];
  topicLabels: Record<string, string>;
  initialFilters: TaskBankFilters;
  initialSelectedTaskIds: string[];
};

export function TaskBank({
  tasks,
  topics,
  topicLabels,
  initialFilters,
  initialSelectedTaskIds,
}: TaskBankProps) {
  const t = useTranslations("taskBank");
  const tasksT = useTranslations("tasks");
  const attempts = useAttempts();
  const saveScroll = useTaskBankScroll();
  const [filters, setFilters] = useState(initialFilters);
  const [selectedTaskIds, setSelectedTaskIds] = useState(
    initialSelectedTaskIds,
  );
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const visibleTasks = useMemo(
    () => filterTaskSummaries(tasks, topicLabels, filters, attempts ?? []),
    [attempts, filters, tasks, topicLabels],
  );
  const selectedSet = useMemo(
    () => new Set(selectedTaskIds),
    [selectedTaskIds],
  );
  const activeCount = activeFilterCount(filters);
  const hasFilters = activeCount > 0 || filters.query.trim() !== "";
  const topicSlots = useMemo(
    () => new Map(topics.map((topic) => [topic.slug, topic.slot])),
    [topics],
  );

  const commit = (
    nextFilters: TaskBankFilters,
    nextSelectedTaskIds = selectedTaskIds,
  ) => {
    const constrainedFilters = constrainTaskBankTopics(nextFilters, topicSlots);
    setFilters(constrainedFilters);
    setSelectedTaskIds(nextSelectedTaskIds);
    const query = serializeTaskBankState(
      constrainedFilters,
      nextSelectedTaskIds,
    ).toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  };

  const toggleSelected = (taskId: string) => {
    const next = selectedSet.has(taskId)
      ? selectedTaskIds.filter((candidate) => candidate !== taskId)
      : [...selectedTaskIds, taskId].slice(0, MAX_PRACTICE_SET_SIZE);
    commit(filters, next);
  };

  const allVisibleSelected =
    visibleTasks.length > 0 &&
    visibleTasks.every((task) => selectedSet.has(task.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visibleTasks.map((task) => task.id));
      commit(
        filters,
        selectedTaskIds.filter((taskId) => !visibleIds.has(taskId)),
      );
      return;
    }
    commit(
      filters,
      [
        ...selectedTaskIds,
        ...visibleTasks
          .map((task) => task.id)
          .filter((taskId) => !selectedSet.has(taskId)),
      ].slice(0, MAX_PRACTICE_SET_SIZE),
    );
  };

  const returnTo = taskBankHref(filters, selectedTaskIds);
  const startHref = taskPracticeHref(
    tasks.find((task) => task.id === selectedTaskIds[0]),
    returnTo,
    selectedTaskIds,
  );

  return (
    <main
      className={`mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 sm:py-10 lg:px-8 ${
        selectedTaskIds.length > 0 ? "pb-36 md:pb-32" : ""
      }`}
    >
      <header className="max-w-3xl">
        <h1 className="text-[2rem] leading-10 font-bold text-ink">
          {tasksT("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          {tasksT("intro")}
        </p>
      </header>

      <div className="mt-7 flex gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search
            aria-hidden
            size={19}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={filters.query}
            maxLength={120}
            onChange={(event) =>
              commit({ ...filters, query: event.currentTarget.value })
            }
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-lg border border-line bg-surface pr-4 pl-11 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <button
          type="button"
          onClick={() => setFilterDialogOpen(true)}
          aria-label={t("filters")}
          className="relative flex h-11 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand xl:hidden"
        >
          <SlidersHorizontal aria-hidden size={18} />
          <span className="hidden sm:inline">{t("filters")}</span>
          {activeCount > 0 && (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs leading-5 font-bold text-on-brand">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <ActiveFilters
        filters={filters}
        topicLabels={topicLabels}
        onChange={(next) => commit(next)}
      />

      <div className="mt-7 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-8">
        <aside className="hidden xl:block">
          <div className="sticky top-24 rounded-lg border border-line bg-surface p-5">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-bold">{t("filters")}</h2>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => commit({ ...defaultTaskBankFilters })}
                  className="text-xs font-semibold text-brand-ink hover:underline"
                >
                  {t("reset")}
                </button>
              )}
            </div>
            <FilterControls
              filters={filters}
              topics={topics}
              topicLabels={topicLabels}
              showReset={false}
              onChange={(next) => commit(next)}
            />
          </div>
        </aside>

        <TaskResults
          tasks={visibleTasks}
          topicLabels={topicLabels}
          filters={filters}
          attempts={attempts}
          selectedTaskIds={selectedSet}
          allSelected={allVisibleSelected}
          mixedSelection={
            !allVisibleSelected &&
            visibleTasks.some((task) => selectedSet.has(task.id))
          }
          returnTo={returnTo}
          onFiltersChange={(next) => commit(next)}
          onToggleAll={toggleAllVisible}
          onToggleTask={toggleSelected}
          onOpenTask={saveScroll}
        />
      </div>

      <MobileFilterDialog
        open={filterDialogOpen}
        filters={filters}
        topics={topics}
        topicLabels={topicLabels}
        onClose={() => setFilterDialogOpen(false)}
        onApply={(next) => {
          commit(next);
          setFilterDialogOpen(false);
        }}
      />

      {selectedTaskIds.length > 0 && (
        <SelectionBar
          count={selectedTaskIds.length}
          href={startHref}
          onClear={() => commit(filters, [])}
          onStart={saveScroll}
        />
      )}
    </main>
  );
}
