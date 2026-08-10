"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
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
  allSelected: boolean;
  mixedSelection: boolean;
  returnTo: string;
  onFiltersChange: (filters: TaskBankFilters) => void;
  onToggleAll: () => void;
  onToggleTask: (taskId: string) => void;
  onOpenTask: () => void;
};

export function TaskResults({
  tasks,
  topicLabels,
  filters,
  attempts,
  selectedTaskIds,
  allSelected,
  mixedSelection,
  returnTo,
  onFiltersChange,
  onToggleAll,
  onToggleTask,
  onOpenTask,
}: TaskResultsProps) {
  const t = useTranslations("taskBank");
  const progressPending = attempts === null && filters.progress !== "all";
  return (
    <section aria-labelledby="task-results-title" className="min-w-0">
      <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SelectAllCheckbox
            checked={allSelected}
            mixed={mixedSelection}
            disabled={tasks.length === 0}
            label={t("selectVisible")}
            onChange={onToggleAll}
          />
          <h2
            id="task-results-title"
            className="text-sm font-semibold text-muted"
          >
            {progressPending
              ? t("loadingProgress")
              : t("resultCount", { count: tasks.length })}
          </h2>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>{t("sortLabel")}</span>
          <select
            value={filters.sort}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                sort: event.currentTarget.value as TaskBankFilters["sort"],
              })
            }
            className="h-10 rounded-lg border border-line bg-surface px-3 font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="position">{t("sort.position")}</option>
            <option value="difficulty">{t("sort.difficulty")}</option>
          </select>
        </label>
      </div>

      {progressPending ? (
        <div
          role="status"
          className="flex min-h-40 items-center justify-center rounded-lg border border-line bg-surface px-6 text-sm font-medium text-muted"
        >
          {t("loadingProgress")}
        </div>
      ) : tasks.length > 0 ? (
        <ul className="space-y-2.5" aria-busy={attempts === null}>
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

function SelectAllCheckbox({
  checked,
  mixed,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 accent-brand"
      />
      <span className="hidden sm:inline">{label}</span>
    </label>
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
    <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface px-6 text-center">
      <Search aria-hidden size={28} className="text-muted" />
      <h3 className="mt-4 text-lg font-bold">{t("emptyTitle")}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        {query ? t("emptyQuery", { query }) : t("emptyFilters")}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 min-h-10 rounded-lg bg-brand px-4 text-sm font-bold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {t("resetFilters")}
      </button>
    </div>
  );
}
