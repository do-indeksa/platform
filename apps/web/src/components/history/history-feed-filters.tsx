"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  historyDifficulties,
  historyPeriods,
  type HistoryDifficulty,
  type HistoryFeedFilters,
  type HistoryPeriod,
} from "@/lib/history-feed";

const periodKeys: Record<HistoryPeriod, string> = {
  all: "all",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
};

const difficultyKeys: Record<HistoryDifficulty, string> = {
  all: "all",
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

export function HistoryFeedFilterControls({
  filters,
  actions,
  onChange,
}: {
  filters: HistoryFeedFilters;
  actions: React.ReactNode;
  onChange: (filters: HistoryFeedFilters) => void;
}) {
  const t = useTranslations("history.feed.filters");

  return (
    <section
      aria-label={t("label")}
      data-testid="history-filters"
      className="grid h-[84px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-1.5 gap-y-2 md:flex md:h-[42px] md:gap-2.5"
    >
      <FilterSelect
        label={t("subjectLabel")}
        value={filters.subject}
        className="md:w-[180px]"
        onChange={(value) =>
          onChange({
            ...filters,
            subject: value === "p1" ? "p1" : "all",
          })
        }
      >
        <option value="all">{t("allSubjects")}</option>
        <option value="p1">{t("p1")}</option>
      </FilterSelect>

      <FilterSelect
        label={t("periodLabel")}
        value={filters.period}
        className="md:w-[170px]"
        onChange={(value) => {
          const period = historyPeriods.includes(value as HistoryPeriod)
            ? (value as HistoryPeriod)
            : "all";
          onChange({ ...filters, period });
        }}
      >
        {historyPeriods.map((period) => (
          <option key={period} value={period}>
            {t(`period.${periodKeys[period]}`)}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label={t("difficultyLabel")}
        value={filters.difficulty}
        className="md:w-[200px]"
        onChange={(value) => {
          const difficulty = historyDifficulties.includes(
            value as HistoryDifficulty,
          )
            ? (value as HistoryDifficulty)
            : "all";
          onChange({ ...filters, difficulty });
        }}
      >
        {historyDifficulties.map((difficulty) => (
          <option key={difficulty} value={difficulty}>
            {t(`difficulty.${difficultyKeys[difficulty]}`)}
          </option>
        ))}
      </FilterSelect>

      <div className="h-[38px] md:h-[42px] md:w-11">{actions}</div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  className,
  children,
  onChange,
}: {
  label: string;
  value: string;
  className: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={`relative block h-[38px] min-w-0 md:h-[42px] ${className}`}
    >
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-full w-full appearance-none truncate rounded-[9px] border border-line bg-surface pr-7 pl-2.5 text-center text-xs leading-4 font-medium text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={11}
        strokeWidth={1.8}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink"
      />
    </label>
  );
}
