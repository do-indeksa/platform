"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PrepPositionProgress, PrepPositionStatus } from "@/lib/prep-plan";
import type { PrepPlanViewMode } from "./prep-plan-tabs";

const styles: Record<
  PrepPositionStatus,
  { badge: string; bar: string; number: string }
> = {
  untested: {
    badge: "border border-line bg-page text-muted",
    bar: "bg-line",
    number: "bg-subtle text-brand-ink",
  },
  starting: {
    badge: "bg-subtle text-brand-ink",
    bar: "bg-brand",
    number: "bg-subtle text-brand-ink",
  },
  needsWork: {
    badge: "bg-amber-50 text-amber-800",
    bar: "bg-amber-400",
    number: "bg-amber-50 text-amber-800",
  },
  progressing: {
    badge: "bg-amber-50 text-amber-800",
    bar: "bg-amber-400",
    number: "bg-amber-50 text-amber-800",
  },
  confident: {
    badge: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
    number: "bg-emerald-50 text-emerald-700",
  },
};

export function PrepPositionList({
  positions,
  mode = "positions",
}: {
  positions: PrepPositionProgress[];
  mode?: Extract<PrepPlanViewMode, "positions" | "topics">;
}) {
  const t = useTranslations("prep");

  return (
    <section
      data-testid="prep-position-list"
      aria-label={
        mode === "topics" ? t("topicsViewLabel") : t("positionProgressTitle")
      }
      data-design-status={mode === "topics" ? "provisional" : undefined}
    >
      <div className="hidden h-[34px] grid-cols-[36px_minmax(280px,1fr)_130px_69px_28px_5px] items-center gap-4 bg-subtle px-[18px] text-xs leading-4 font-medium text-muted lg:grid">
        <span className="col-span-2">
          {mode === "topics" ? t("tableTopic") : t("tablePosition")}
        </span>
        <span>{t("tableProgress")}</span>
        <span>{t("tableStatus")}</span>
        <span className="text-right">{t("tableEvidence")}</span>
      </div>
      <ol className="flex flex-col lg:mt-4">
        {positions.map((position) => (
          <PositionRow key={position.number} position={position} />
        ))}
      </ol>
    </section>
  );
}

function PositionRow({ position }: { position: PrepPositionProgress }) {
  const t = useTranslations("prep");
  const statusStyles = styles[position.status];
  const query = new URLSearchParams();
  for (const topic of position.topicSlugs) query.append("topic", topic);
  const href = `/tasks?${query}`;
  const evidence = positionEvidence(t, position);

  return (
    <li
      data-testid={`prep-position-${position.number}`}
      className="h-[124px] overflow-hidden rounded-xl border border-line bg-surface lg:h-[66px] lg:rounded-none"
    >
      <Link
        href={href}
        className="group flex h-[122px] w-full min-w-0 flex-col gap-0.5 px-[11px] py-[9px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand lg:grid lg:h-16 lg:grid-cols-[36px_minmax(280px,1fr)_130px_69px_28px_5px] lg:items-center lg:gap-4 lg:px-[17px] lg:py-0"
      >
        <span className="flex h-[60px] min-w-0 shrink-0 items-start gap-2.5 overflow-hidden lg:contents">
          <span
            data-plan-cell="number"
            className={`mt-[9px] flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-sm leading-5 font-semibold lg:mt-0 ${statusStyles.number}`}
          >
            {position.number}
          </span>
          <span
            data-plan-cell="copy"
            className="mt-0.5 h-[58px] min-w-0 flex-1 overflow-hidden lg:mt-0 lg:block lg:h-auto"
          >
            <span className="line-clamp-2 block text-sm leading-5 font-semibold text-ink group-hover:text-brand-ink lg:line-clamp-1">
              {position.name}
            </span>
            <span className="mt-0.5 block h-4 overflow-hidden text-xs leading-4 font-medium text-ellipsis whitespace-nowrap text-muted">
              {position.description ?? t("positionNoEvidence")}
            </span>
          </span>
          <ChevronRight
            data-plan-cell="arrow"
            aria-hidden
            className="mt-[15px] h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 lg:order-[6] lg:mt-0"
            strokeWidth={1.8}
          />
        </span>

        <span
          data-plan-cell="bottom"
          className="flex h-10 min-w-0 items-center gap-2.5 lg:contents"
        >
          <span className="flex h-[38px] w-[116px] shrink-0 flex-col gap-1 lg:order-[3] lg:w-[130px]">
            <span className="text-xs leading-4 font-medium tabular-nums text-ink">
              {position.correct}/{position.total}
            </span>
            <span
              role="progressbar"
              aria-label={t("positionProgressAria", {
                position: position.number,
              })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={position.readiness}
              className="h-[5px] w-full overflow-hidden rounded-[3px] bg-line"
            >
              <span
                className={`block h-full rounded-[3px] ${statusStyles.bar}`}
                style={{ width: `${position.readiness}%` }}
              />
            </span>
          </span>
          <span
            className={`shrink-0 rounded-[7px] px-[9px] py-[5px] text-xs leading-4 font-medium whitespace-nowrap lg:order-[4] ${statusStyles.badge}`}
          >
            {t(`positionStatus.${position.status}`)}
          </span>
          <span
            title={evidence}
            aria-label={evidence}
            className="ml-auto min-w-0 text-right text-xs leading-4 font-medium whitespace-nowrap text-muted lg:order-[5] lg:ml-0 lg:w-auto"
          >
            <span className="lg:hidden">{evidence}</span>
            <span aria-hidden className="hidden lg:inline">
              {position.total > 0 ? `${position.total}×` : "—"}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

type PrepTranslation = ReturnType<typeof useTranslations<"prep">>;

function positionEvidence(
  t: PrepTranslation,
  position: PrepPositionProgress,
): string {
  if (position.total === 0) return t("positionSignalNone");
  if (position.errors > 0) {
    return t("positionSignalErrors", { count: position.errors });
  }
  if (position.assistedCorrect > 0) {
    return t("positionSignalHints", { count: position.assistedCorrect });
  }
  return t("positionSignalAnswers", { count: position.total });
}
