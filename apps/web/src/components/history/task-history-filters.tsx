"use client";

import { RotateCcw, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  hasActiveTaskHistoryFilters,
  isTaskHistoryOutcomeFilter,
  isTaskHistoryPeriodFilter,
  taskHistoryOutcomeFilters,
  taskHistoryPeriodFilters,
  type TaskHistoryFilters,
  type TaskHistoryPeriodFilter,
} from "@/lib/task-history-filters";

export type TaskHistoryFilterTopic = {
  slug: string;
  label: string;
};

const periodMessage: Record<TaskHistoryPeriodFilter, string> = {
  all: "allTime",
  "7d": "last7Days",
  "30d": "last30Days",
  "90d": "last90Days",
};

export function TaskHistoryFilterControls({
  filters,
  topics,
  visibleCount,
  totalCount,
  onChange,
  onReset,
}: {
  filters: TaskHistoryFilters;
  topics: readonly TaskHistoryFilterTopic[];
  visibleCount: number;
  totalCount: number;
  onChange: (filters: TaskHistoryFilters) => void;
  onReset: () => void;
}) {
  const t = useTranslations("history");
  const active = hasActiveTaskHistoryFilters(filters);

  return (
    <section
      aria-label={t("filters.label")}
      data-testid="task-history-filters"
      className="mb-5 border-b border-line pb-5"
    >
      <div className="flex flex-col">
        <div className="order-1 mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3 sm:order-2 sm:mt-3 sm:mb-0">
          <p aria-live="polite" className="text-sm text-muted">
            {t("filters.showing", { visible: visibleCount, total: totalCount })}
          </p>
          {active && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-brand-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              {t("filters.reset")}
            </button>
          )}
        </div>

        <div className="order-2 grid gap-2 sm:order-1 sm:grid-cols-3 sm:gap-3">
          <FilterField label={t("filters.topicLabel")}>
            <select
              value={filters.topic ?? ""}
              onChange={(event) => {
                const topic = event.currentTarget.value;
                onChange({
                  ...filters,
                  topic:
                    topic !== "" &&
                    topics.some((candidate) => candidate.slug === topic)
                      ? topic
                      : null,
                });
              }}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              <option value="">{t("filters.allTopics")}</option>
              {topics.map((topic) => (
                <option key={topic.slug} value={topic.slug}>
                  {topic.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t("filters.outcomeLabel")}>
            <select
              value={filters.outcome}
              onChange={(event) => {
                const outcome = event.currentTarget.value;
                if (isTaskHistoryOutcomeFilter(outcome)) {
                  onChange({ ...filters, outcome });
                }
              }}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              {taskHistoryOutcomeFilters.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcome === "all"
                    ? t("filters.allOutcomes")
                    : t(`outcome.${outcome}`)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t("filters.periodLabel")}>
            <select
              value={filters.period}
              onChange={(event) => {
                const period = event.currentTarget.value;
                if (isTaskHistoryPeriodFilter(period)) {
                  onChange({ ...filters, period });
                }
              }}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              {taskHistoryPeriodFilters.map((period) => (
                <option key={period} value={period}>
                  {t(`filters.period.${periodMessage[period]}`)}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>
    </section>
  );
}

export function TaskHistoryFilteredEmpty({ onReset }: { onReset: () => void }) {
  const t = useTranslations("history");
  return (
    <section className="border-y border-line py-10 text-center sm:py-14">
      <SearchX aria-hidden className="mx-auto h-8 w-8 text-brand" />
      <h2 className="mt-4 text-xl font-bold">{t("filters.emptyTitle")}</h2>
      <p className="mx-auto mt-2 max-w-md leading-7 text-muted">
        {t("filters.emptyDescription")}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
        {t("filters.reset")}
      </button>
    </section>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-ink sm:gap-1.5">
      <span>{label}</span>
      {children}
    </label>
  );
}
