"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function TaskNavigation({
  previousHref,
  nextHref,
  onSkip,
}: {
  previousHref: string | null;
  nextHref: string | null;
  onSkip: () => void;
}) {
  const t = useTranslations("tasks");

  return (
    <nav
      aria-label={t("taskNavigationLabel")}
      data-testid="task-workspace-navigation"
      className="flex h-[72px] w-full items-center justify-between rounded-[16px] border border-line bg-surface p-3 md:h-[82px] md:p-5 xl:w-[850px]"
    >
      {previousHref ? (
        <Link
          href={previousHref}
          className="inline-flex h-12 w-[30%] items-center justify-center gap-2 rounded-[11px] border border-line bg-surface px-2 text-[13px] leading-[1.45] font-medium text-ink transition-colors hover:bg-page md:h-[46px] md:w-[220px]"
        >
          <ArrowLeft
            aria-hidden="true"
            className="hidden size-4 shrink-0 sm:block"
          />
          <span className="sm:hidden">{t("previousTaskShort")}</span>
          <span className="hidden sm:inline">{t("previousTask")}</span>
        </Link>
      ) : (
        <DisabledNavigationButton label={t("previousTask")} />
      )}

      <button
        type="button"
        onClick={onSkip}
        className="inline-flex h-12 w-[30%] items-center justify-center rounded-[11px] border border-line bg-subtle px-2 text-[13px] leading-[1.45] font-medium text-ink transition-colors hover:bg-subtle-hover md:h-[46px] md:w-[160px]"
      >
        {t("skipTask")}
      </button>

      {nextHref ? (
        <Link
          href={nextHref}
          className="inline-flex h-12 w-[30%] items-center justify-center gap-2 rounded-[11px] bg-brand px-2 text-[13px] leading-[1.45] font-medium text-on-brand transition-colors hover:bg-brand-hover md:h-[46px] md:w-[220px]"
        >
          <span className="sm:hidden">{t("nextTaskShort")}</span>
          <span className="hidden sm:inline">{t("nextTask")}</span>
          <ArrowRight
            aria-hidden="true"
            className="hidden size-4 shrink-0 sm:block"
          />
        </Link>
      ) : (
        <DisabledNavigationButton label={t("nextTask")} primary />
      )}
    </nav>
  );
}

function DisabledNavigationButton({
  label,
  primary = false,
}: {
  label: string;
  primary?: boolean;
}) {
  return (
    <span
      aria-disabled="true"
      className={`inline-flex h-12 w-[30%] items-center justify-center rounded-[11px] px-2 text-[13px] font-medium opacity-40 md:h-[46px] md:w-[220px] ${
        primary
          ? "bg-brand text-on-brand"
          : "border border-line bg-surface text-ink"
      }`}
    >
      {label}
    </span>
  );
}
