"use client";

import { ArrowRight, CalendarDays, ListChecks, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PrepAction } from "@/lib/prep-plan";
import { actionTitle } from "./prep-action-copy";

export function PrepPlanFacts({
  nextAction,
  nextActionHref,
  actions,
  formattedExamDate,
  onOpenSettings,
}: {
  nextAction: PrepAction | null;
  nextActionHref: string;
  actions: PrepAction[];
  formattedExamDate: string | null;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("prep");
  const completed = actions.filter((action) => action.completed).length;
  const minutes = actions.reduce((sum, action) => sum + action.minutes, 0);

  return (
    <section
      data-testid="prep-plan-facts"
      aria-label={t("factsLabel")}
      className="grid min-h-[210px] grid-cols-1 gap-2.5 overflow-hidden rounded-[14px] border border-line bg-surface px-[18px] py-3.5 lg:min-h-[86px] lg:grid-cols-3 lg:gap-[22px]"
    >
      <NextActionFact
        action={nextAction}
        href={nextActionHref}
        onOpenSettings={onOpenSettings}
      />
      <Fact
        icon={ListChecks}
        label={t("factTodayTitle")}
        value={t("factTodayValue", {
          completed,
          total: actions.length,
          minutes,
        })}
      />
      <Fact
        icon={CalendarDays}
        label={t("factPlanDateTitle")}
        value={formattedExamDate ?? t("summaryDatePrompt")}
      />
    </section>
  );
}

function NextActionFact({
  action,
  href,
  onOpenSettings,
}: {
  action: PrepAction | null;
  href: string;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("prep");
  const content = (
    <>
      <Sparkles
        aria-hidden
        className="h-[22px] w-[22px] shrink-0 text-brand-ink"
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 font-medium text-muted">
          {t("nextEyebrow")}
        </span>
        <span className="mt-0.5 block text-sm leading-5 font-semibold text-ink">
          {action ? actionTitle(t, action) : t("allDoneTitle")}
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-brand-ink"
        strokeWidth={1.8}
      />
    </>
  );
  const classes =
    "flex min-h-[52px] min-w-0 items-center gap-3 rounded-lg text-left transition-colors hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:px-1";

  if (action?.kind === "settings") {
    return (
      <button
        type="button"
        data-testid="next-action"
        onClick={onOpenSettings}
        className={classes}
      >
        {content}
      </button>
    );
  }
  return (
    <Link href={href} data-testid="next-action" className={classes}>
      {content}
    </Link>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[52px] min-w-0 items-center gap-3 lg:px-1">
      <Icon
        aria-hidden
        className="h-[22px] w-[22px] shrink-0 text-brand-ink"
        strokeWidth={1.8}
      />
      <span className="min-w-0">
        <span className="block text-xs leading-4 font-medium text-muted">
          {label}
        </span>
        <span className="mt-0.5 block text-sm leading-5 font-semibold text-ink">
          {value}
        </span>
      </span>
    </div>
  );
}
