"use client";

import { ChevronDown, RectangleHorizontal, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";

type TaskBankToolbarProps = {
  query: string;
  activeFilterCount: number;
  onQueryChange: (query: string) => void;
  onOpenFilters: () => void;
  onReset: () => void;
};

export function TaskBankToolbar({
  query,
  activeFilterCount,
  onQueryChange,
  onOpenFilters,
  onReset,
}: TaskBankToolbarProps) {
  const t = useTranslations("taskBank");
  const tasksT = useTranslations("tasks");

  return (
    <div className="contents">
      <div className="flex h-[34px] items-center justify-between md:h-[42px]">
        <h1 className="text-[22px] leading-[30px] font-semibold text-ink md:text-[32px] md:leading-10 md:font-bold">
          {tasksT("title")}
        </h1>
        <div
          data-design-status="provisional"
          className="flex w-[46px] items-center justify-between text-muted md:w-[220px] md:text-sm md:leading-5"
        >
          <span className="flex h-[34px] w-4 items-center justify-center gap-2 md:h-5 md:w-[97px] md:justify-start">
            <Star aria-hidden size={16} strokeWidth={1.5} />
            <span className="hidden md:inline">{t("favorites")}</span>
          </span>
          <span className="flex h-[34px] w-4 items-center justify-center gap-2 md:h-5 md:w-[105px] md:justify-start">
            <RectangleHorizontal aria-hidden size={14} strokeWidth={1.4} />
            <span className="hidden md:inline">{t("mySets")}</span>
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("subjects")}
        className="flex items-start gap-1 md:gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="h-[30px] w-[103px] rounded-[9px] bg-subtle text-xs leading-4 font-medium text-brand-ink md:h-[34px] md:w-[124px] md:text-sm md:leading-5 md:font-normal"
        >
          {t("allSubjects")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          data-design-status="provisional"
          className="h-[30px] w-[91px] rounded-[9px] text-xs leading-4 font-medium text-ink md:h-[34px] md:w-[110px] md:text-sm md:leading-5 md:font-normal"
        >
          {t("mathematics")}
        </button>
      </div>

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
          label={t("taskTypeControl")}
          mobileLabel={t("taskTypeControlShort")}
          provisional
        />
        <FilterControl
          mobileWidth="w-[98px]"
          desktopWidth="md:w-[122px]"
          label={t("sourceControl")}
          provisional
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
  provisional = false,
}: {
  mobileWidth: string;
  desktopWidth: string;
  label: string;
  mobileLabel?: string;
  onClick?: () => void;
  provisional?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={provisional || undefined}
      data-design-status={provisional ? "provisional" : undefined}
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
