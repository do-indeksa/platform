"use client";

import { CalendarDays, Pencil, Target } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrepPlanSummary({
  readiness,
  covered,
  total,
  goalPoints,
  maxPoints,
  daysUntilExam,
  formattedExamDate,
  onEdit,
}: {
  readiness: number;
  covered: number;
  total: number;
  goalPoints: number | null;
  maxPoints: number;
  daysUntilExam: number | null;
  formattedExamDate: string | null;
  onEdit: () => void;
}) {
  const t = useTranslations("prep");
  const dateValue =
    daysUntilExam === null
      ? t("summaryDateUnset")
      : daysUntilExam < 0
        ? t("summaryDatePassed")
        : t("summaryDays", { days: daysUntilExam });

  return (
    <section
      data-testid="prep-plan-summary"
      aria-label={t("summaryLabel")}
      className="grid h-[252px] grid-cols-2 content-start gap-x-2.5 gap-y-3 overflow-hidden rounded-[14px] border border-line bg-surface px-[17px] py-[15px] lg:h-[116px] lg:grid-cols-[minmax(240px,1.4fr)_minmax(150px,1fr)_minmax(150px,1fr)_190px] lg:content-center lg:items-center lg:gap-[18px] xl:grid-cols-[330px_220px_220px_minmax(0,1fr)_190px]"
    >
      <div className="col-span-2 flex h-[72px] min-w-0 items-center gap-3.5 lg:col-span-1 lg:h-20 lg:gap-4">
        <ReadinessRing value={readiness} label={t("readinessTitle")} />
        <div className="min-w-0">
          <p className="text-sm leading-5 text-muted">
            {t("summaryProgressTitle")}
          </p>
          <p className="mt-[3px] text-sm leading-5 font-semibold text-ink">
            {t("summaryCoverage", { covered, total })}
          </p>
          <div
            aria-hidden
            className="mt-[3px] hidden h-[5px] w-[180px] overflow-hidden rounded-[3px] bg-line lg:block"
          >
            <span className="block h-full rounded-[3px] bg-brand" />
          </div>
        </div>
      </div>

      <SummaryMetric
        icon={CalendarDays}
        label={t("summaryExamTitle")}
        value={dateValue}
        detail={formattedExamDate ?? t("summaryDatePrompt")}
      />
      <SummaryMetric
        icon={Target}
        label={t("summaryGoalTitle")}
        value={
          goalPoints === null
            ? t("summaryGoalUnset")
            : t("summaryGoalValue", { goal: goalPoints, max: maxPoints })
        }
        detail={t("summaryGoalContext")}
      />

      <span aria-hidden className="hidden min-w-0 xl:block" />

      <button
        type="button"
        onClick={onEdit}
        className="col-span-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-sm leading-5 font-semibold whitespace-nowrap text-brand-ink transition-colors hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:col-span-1 lg:w-[190px]"
      >
        <Pencil aria-hidden size={15} strokeWidth={1.8} />
        {t("editPlan")}
      </button>
    </section>
  );
}

function ReadinessRing({ value, label }: { value: number; label: string }) {
  const normalized = Math.min(100, Math.max(0, value));

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[7px] border-brand lg:h-[68px] lg:w-[68px]"
    >
      <span className="text-sm leading-5 font-semibold tabular-nums text-ink">
        {normalized}%
      </span>
    </span>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex h-[76px] min-w-0 items-center gap-2 lg:h-[72px] lg:gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-brand-ink lg:h-[42px] lg:w-[42px]">
        <Icon aria-hidden size={20} strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm leading-5 text-muted">{label}</span>
        <span className="block text-base leading-5 font-semibold text-ink lg:text-[22px] lg:leading-[30px]">
          {value}
        </span>
        <span className="block text-xs leading-4 font-medium text-muted">
          {detail}
        </span>
      </span>
    </div>
  );
}
