"use client";

import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProgressFilter } from "@/lib/task-bank";
import { TaskBankHeading } from "./task-bank-heading";

type TaskBankToolbarProps = {
  query: string;
  progress: ProgressFilter;
  activeFilterCount: number;
  onQueryChange: (query: string) => void;
  onProgressChange: (progress: ProgressFilter) => void;
  onOpenFilters: () => void;
  onReset: () => void;
};

export function TaskBankToolbar({
  query,
  progress,
  activeFilterCount,
  onQueryChange,
  onProgressChange,
  onOpenFilters,
  onReset,
}: TaskBankToolbarProps) {
  const t = useTranslations("taskBank");

  return (
    <div className="contents">
      <TaskBankHeading
        progress={progress}
        onProgressChange={onProgressChange}
      />

      <div className="flex flex-col gap-2.5 md:flex-row md:gap-3 md:pr-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search
            aria-hidden
            size={12}
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted md:left-3.5"
          />
          <input
            type="search"
            value={query}
            maxLength={120}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-[9px] border border-line bg-surface pr-3 pl-8 text-sm leading-5 text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 md:h-11 md:rounded-[10px] md:pr-3.5 md:pl-9"
          />
        </label>
        <div className="grid h-10 grid-cols-2 gap-2 md:contents">
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={t("filters")}
            className="flex h-10 items-center justify-center gap-1.5 rounded-[9px] bg-brand px-2.5 text-xs leading-4 font-medium text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-11 md:w-28"
          >
            <span>{t("filters")}</span>
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="h-10 rounded-[9px] border border-line bg-surface px-2.5 text-xs leading-4 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-11 md:w-[130px]"
          >
            {t("reset")}
          </button>
        </div>
      </div>

      <div className="flex h-[34px] items-start gap-1 overflow-hidden md:h-[42px] md:gap-2">
        <FilterControl
          mobileWidth="w-[82px]"
          desktopWidth="md:w-28"
          label={t("topicsControl")}
          onClick={onOpenFilters}
        />
        <FilterControl
          mobileWidth="w-[88px]"
          desktopWidth="md:w-[132px]"
          label={t("difficultyControl")}
          mobileLabel={t("difficultyControlShort")}
          onClick={onOpenFilters}
        />
        <FilterControl
          mobileWidth="w-[78px]"
          desktopWidth="md:w-[142px]"
          label={t("positionControl")}
          mobileLabel={t("positionControlShort")}
          onClick={onOpenFilters}
        />
        <FilterControl
          mobileWidth="w-[98px]"
          desktopWidth="md:w-[122px]"
          label={t("progressControl")}
          mobileLabel={t("progressControlShort")}
          onClick={onOpenFilters}
        />
      </div>
    </div>
  );
}

function FilterControl({
  mobileWidth,
  desktopWidth,
  label,
  mobileLabel,
  onClick,
}: {
  mobileWidth: string;
  desktopWidth: string;
  label: string;
  mobileLabel?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-surface px-2.5 text-xs leading-4 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-[42px] ${mobileWidth} ${desktopWidth}`}
    >
      <span
        className={`items-center gap-1 ${mobileLabel ? "inline-flex md:hidden" : "inline-flex"}`}
      >
        {mobileLabel ?? label}
        <ChevronDown aria-hidden size={9} strokeWidth={1.5} />
      </span>
      {mobileLabel && (
        <span className="hidden items-center gap-1 md:inline-flex">
          {label}
          <ChevronDown aria-hidden size={9} strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}
