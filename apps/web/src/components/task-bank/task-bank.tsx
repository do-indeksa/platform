"use client";

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
import { MobileFilterDialog } from "./mobile-filter-dialog";
import { SelectionBar } from "./selection-bar";
import { TaskResults } from "./task-results";
import { TaskBankToolbar } from "./task-bank-toolbar";
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

  const returnTo = taskBankHref(filters, selectedTaskIds);
  const startHref = taskPracticeHref(
    tasks.find((task) => task.id === selectedTaskIds[0]),
    returnTo,
    selectedTaskIds,
  );

  return (
    <main
      data-testid="task-bank"
      className="mx-auto flex w-[calc(100%_-_32px)] max-w-[1040px] flex-col gap-2.5 pt-4 pb-8 md:w-[calc(100%_-_104px)] md:gap-3 md:pt-[22px] md:pb-10 xl:w-[1040px] xl:pt-[26px]"
    >
      <TaskBankToolbar
        query={filters.query}
        progress={filters.progress}
        activeFilterCount={activeCount}
        onQueryChange={(query) => commit({ ...filters, query })}
        onProgressChange={(progress) => commit({ ...filters, progress })}
        onOpenFilters={() => setFilterDialogOpen(true)}
        onReset={() => commit({ ...defaultTaskBankFilters })}
      />

      {selectedTaskIds.length > 0 ? (
        <SelectionBar
          count={selectedTaskIds.length}
          href={startHref}
          onClear={() => commit(filters, [])}
          onStart={saveScroll}
        />
      ) : (
        <ActiveFilters
          filters={filters}
          topicLabels={topicLabels}
          onChange={(next) => commit(next)}
        />
      )}

      <TaskResults
        tasks={visibleTasks}
        topicLabels={topicLabels}
        filters={filters}
        attempts={attempts}
        selectedTaskIds={selectedSet}
        returnTo={returnTo}
        onFiltersChange={(next) => commit(next)}
        onToggleTask={toggleSelected}
        onOpenTask={saveScroll}
      />

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
    </main>
  );
}
