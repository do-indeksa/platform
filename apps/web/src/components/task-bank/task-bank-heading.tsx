"use client";

import { History, Map } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ProgressFilter } from "@/lib/task-bank";

type TaskBankHeadingProps = {
  progress: ProgressFilter;
  onProgressChange: (progress: ProgressFilter) => void;
};

const progressTabs = [
  {
    value: "all",
    label: "allTasksTab",
    width: "w-[103px] md:w-[124px]",
  },
  {
    value: "new",
    label: "newTasksTab",
    width: "w-[91px] md:w-[110px]",
  },
  {
    value: "incorrect",
    label: "reviewTasksTab",
    width: "w-[63px] md:w-[79px]",
  },
] as const satisfies readonly {
  value: ProgressFilter;
  label: "allTasksTab" | "newTasksTab" | "reviewTasksTab";
  width: string;
}[];

export function TaskBankHeading({
  progress,
  onProgressChange,
}: TaskBankHeadingProps) {
  const t = useTranslations("taskBank");
  const tasksT = useTranslations("tasks");

  return (
    <>
      <div className="flex h-[34px] items-center justify-between md:h-[42px]">
        <h1 className="text-[22px] leading-[30px] font-semibold text-ink md:text-[32px] md:leading-10 md:font-bold">
          {tasksT("title")}
        </h1>
        <nav
          aria-label={t("shortcuts")}
          className="flex w-[46px] items-center justify-between text-muted md:w-[220px] md:gap-[18px]"
        >
          <Link
            href="/history?tab=tasks"
            aria-label={t("historyShortcut")}
            className="flex h-[34px] w-4 items-center justify-center gap-2 text-muted transition-colors hover:text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-5 md:w-[97px] md:justify-start md:text-sm md:leading-5"
          >
            <History aria-hidden size={16} strokeWidth={1.5} />
            <span className="hidden md:inline">{t("historyShortcut")}</span>
          </Link>
          <Link
            href="/prep"
            aria-label={t("studyPlanShortcut")}
            className="flex h-[34px] w-4 items-center justify-center gap-2 text-muted transition-colors hover:text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-5 md:w-[105px] md:justify-start md:text-sm md:leading-5"
          >
            <Map aria-hidden size={14} strokeWidth={1.4} />
            <span className="hidden md:inline">{t("studyPlanShortcut")}</span>
          </Link>
        </nav>
      </div>

      <div
        role="tablist"
        aria-label={t("progressTabs")}
        className="flex items-start gap-1 md:gap-2"
      >
        {progressTabs.map((tab) => {
          const selected = progress === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onProgressChange(tab.value)}
              className={`h-[30px] rounded-[9px] text-xs leading-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-[34px] md:text-sm md:leading-5 md:font-normal ${tab.width} ${
                selected ? "bg-subtle text-brand-ink" : "text-ink"
              }`}
            >
              {t(tab.label)}
            </button>
          );
        })}
      </div>
    </>
  );
}
