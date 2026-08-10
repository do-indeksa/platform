"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Topic } from "@/lib/content";
import {
  defaultTaskBankFilters,
  difficultyBands,
  progressFilters,
  type TaskBankFilters,
} from "@/lib/task-bank";

type FilterControlsProps = {
  filters: TaskBankFilters;
  topics: Pick<Topic, "slug" | "slot">[];
  topicLabels: Record<string, string>;
  showReset?: boolean;
  onChange: (filters: TaskBankFilters) => void;
};

export function FilterControls({
  filters,
  topics,
  topicLabels,
  showReset = true,
  onChange,
}: FilterControlsProps) {
  const t = useTranslations("taskBank");
  const availableTopics =
    filters.positions.length === 0
      ? topics
      : topics.filter((topic) => filters.positions.includes(topic.slot));

  return (
    <div className="space-y-7">
      <FilterGroup legend={t("positionFilter")}>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, index) => index + 1).map(
            (position) => (
              <CheckTile
                key={position}
                checked={filters.positions.includes(position)}
                label={String(position)}
                ariaLabel={t("positionOption", { position })}
                onChange={() =>
                  onChange({
                    ...filters,
                    positions: toggle(filters.positions, position),
                  })
                }
              />
            ),
          )}
        </div>
      </FilterGroup>

      <FilterGroup legend={t("topicFilter")}>
        <div className="space-y-1.5">
          {availableTopics.map((topic) => (
            <label
              key={topic.slug}
              className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink transition-colors hover:bg-page"
            >
              <input
                type="checkbox"
                checked={filters.topics.includes(topic.slug)}
                onChange={() =>
                  onChange({
                    ...filters,
                    topics: toggle(filters.topics, topic.slug),
                  })
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="leading-5">
                <span className="mr-1.5 text-xs font-semibold text-muted">
                  {topic.slot}.
                </span>
                {topicLabels[topic.slug]}
              </span>
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup legend={t("difficultyFilter")}>
        <div className="space-y-1.5">
          {difficultyBands.map((band) => (
            <label
              key={band}
              className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink transition-colors hover:bg-page"
            >
              <input
                type="checkbox"
                checked={filters.difficulties.includes(band)}
                onChange={() =>
                  onChange({
                    ...filters,
                    difficulties: toggle(filters.difficulties, band),
                  })
                }
                className="h-4 w-4 accent-brand"
              />
              {t(`difficulty.${band}`)}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup legend={t("progressFilter")}>
        <div className="space-y-1.5">
          {progressFilters.map((progress) => (
            <label
              key={progress}
              className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink transition-colors hover:bg-page"
            >
              <input
                type="radio"
                name="task-progress-filter"
                value={progress}
                checked={filters.progress === progress}
                onChange={() => onChange({ ...filters, progress })}
                className="h-4 w-4 accent-brand"
              />
              {t(`progress.${progress}`)}
            </label>
          ))}
        </div>
      </FilterGroup>

      {showReset && (
        <button
          type="button"
          onClick={() => onChange({ ...defaultTaskBankFilters })}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <RotateCcw aria-hidden size={16} />
          {t("resetFilters")}
        </button>
      )}
    </div>
  );
}

function FilterGroup({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-bold text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

function CheckTile({
  checked,
  label,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  label: string;
  ariaLabel: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`relative flex aspect-square min-h-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition-colors ${
        checked
          ? "border-brand bg-subtle text-brand-ink"
          : "border-line bg-surface text-muted hover:border-brand"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {label}
    </label>
  );
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}
