"use client";

import { ArrowRight, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Attempt } from "@/lib/knowledge";
import type { TaskSummary } from "@/lib/content";
import {
  defaultTaskBankFilters,
  taskPracticeHref,
  taskProgress,
  type TaskBankFilters,
} from "@/lib/task-bank";
import { TaskRow } from "./task-row";

type TaskResultsProps = {
  tasks: TaskSummary[];
  topicLabels: Record<string, string>;
  filters: TaskBankFilters;
  attempts: Attempt[] | null;
  selectedTaskIds: ReadonlySet<string>;
  returnTo: string;
  onFiltersChange: (filters: TaskBankFilters) => void;
  onToggleTask: (taskId: string) => void;
  onOpenTask: () => void;
};

export function TaskResults({
  tasks,
  topicLabels,
  filters,
  attempts,
  selectedTaskIds,
  returnTo,
  onFiltersChange,
  onToggleTask,
  onOpenTask,
}: TaskResultsProps) {
  const t = useTranslations("taskBank");
  const progressPending = attempts === null && filters.progress !== "all";

  return (
    <section
      aria-labelledby="task-results-title"
      className="flex min-w-0 flex-col gap-2.5 md:gap-3"
    >
      <div className="flex h-8 items-center justify-between text-muted">
        <h2 id="task-results-title" className="text-sm leading-5 font-normal">
          {progressPending
            ? t("loadingProgress")
            : t("resultCount", { count: tasks.length })}
        </h2>
        {!progressPending && tasks.length > 0 && (
          <label className="relative flex h-8 items-center text-xs leading-4 font-medium">
            <span aria-hidden className="flex items-center gap-1">
              {t(`sort.${filters.sort}`)}
              <ChevronDown size={9} strokeWidth={1.5} />
            </span>
            <span className="sr-only">{t("sortLabel")}</span>
            <select
              aria-label={t("sortLabel")}
              value={filters.sort}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  sort: event.currentTarget.value as TaskBankFilters["sort"],
                })
              }
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            >
              <option value="position">{t("sort.position")}</option>
              <option value="difficulty">{t("sort.difficulty")}</option>
            </select>
          </label>
        )}
      </div>

      {progressPending ? (
        <div
          role="status"
          className="flex min-h-40 items-center justify-center rounded-xl border border-line bg-surface px-6 text-sm font-medium text-muted"
        >
          {t("loadingProgress")}
        </div>
      ) : tasks.length > 0 ? (
        <ul className="flex flex-col" aria-busy={attempts === null}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              topicLabel={topicLabels[task.topic]}
              selected={selectedTaskIds.has(task.id)}
              progress={attempts ? taskProgress(attempts, task.id) : null}
              href={taskPracticeHref(task, returnTo)}
              onOpen={onOpenTask}
              onSelect={() => onToggleTask(task.id)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          query={filters.query}
          onReset={() => onFiltersChange({ ...defaultTaskBankFilters })}
        />
      )}
    </section>
  );
}

function EmptyState({
  query,
  onReset,
}: {
  query: string;
  onReset: () => void;
}) {
  const t = useTranslations("taskBank");
  return (
    <div className="flex h-[380px] flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center">
      <span
        aria-hidden
        className="flex h-[72px] w-[41px] items-center justify-center text-brand-ink"
      >
        <Search size={40} strokeWidth={4} className="-scale-x-100" />
      </span>
      <h3 className="text-[22px] leading-[30px] font-semibold text-ink">
        {t("emptyTitle")}
      </h3>
      <p className="max-w-md text-sm leading-5 text-muted">
        {query ? t("emptyQuery", { query }) : t("emptyFilters")}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="h-[42px] w-[190px] rounded-[9px] border border-line bg-surface px-2.5 text-xs leading-4 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {t("resetFilters")}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="relative flex h-4 w-[165px] items-center justify-center text-xs leading-4 font-medium text-brand-ink before:absolute before:-inset-x-3 before:-inset-y-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          {t("viewAllTasks")}
          <ArrowRight aria-hidden size={12} strokeWidth={1.6} />
        </span>
      </button>
    </div>
  );
}
