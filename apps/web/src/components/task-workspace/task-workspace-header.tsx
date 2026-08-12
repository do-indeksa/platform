"use client";

import { Calculator, Clock3, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatElapsedTime } from "./task-session";

export function TaskWorkspaceHeader({
  slot,
  topicName,
  current,
  total,
  elapsedSeconds,
  statementVisible,
  returnTo,
  onToggleStatement,
}: {
  slot: number;
  topicName: string;
  current: number;
  total: number;
  elapsedSeconds: number;
  statementVisible: boolean;
  returnTo: string;
  onToggleStatement: () => void;
}) {
  const t = useTranslations("tasks");
  const progress = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <>
      <Link
        href={returnTo}
        className="inline-flex min-h-6 items-center text-[13px] leading-[1.45] font-medium text-muted transition-colors hover:text-ink"
      >
        {t("backToPractice")}
      </Link>

      <div className="flex min-h-[54px] w-full flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="min-w-0 text-[28px] leading-[1.45] font-bold text-ink lg:max-w-[520px] xl:max-w-[760px]">
          {t("workspaceTitle", { position: slot, topic: topicName })}
        </h1>
        <div className="grid h-[46px] w-full grid-cols-2 gap-[10px] lg:w-auto lg:grid-cols-[170px_190px]">
          <Link
            href="/calculator"
            className="inline-flex h-[46px] min-w-0 items-center justify-center gap-2 rounded-[11px] border border-line bg-surface px-3 text-[13px] leading-[1.45] font-medium text-ink transition-colors hover:bg-page"
          >
            <Calculator aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{t("calculator")}</span>
          </Link>
          <button
            type="button"
            aria-pressed={!statementVisible}
            onClick={onToggleStatement}
            className="inline-flex h-[46px] min-w-0 items-center justify-center gap-2 rounded-[11px] border border-line bg-surface px-3 text-[13px] leading-[1.45] font-medium text-ink transition-colors hover:bg-page"
          >
            {statementVisible ? (
              <EyeOff aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <Eye aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span className="truncate">
              {statementVisible ? t("hideStatement") : t("showStatement")}
            </span>
          </button>
        </div>
      </div>

      <div className="flex min-h-[86px] w-full flex-wrap content-center items-center gap-x-2 gap-y-3 md:grid md:min-h-[38px] md:grid-cols-[122px_minmax(0,1fr)_50px_100px] md:gap-x-4 lg:grid-cols-[122px_390px_50px_100px] xl:grid-cols-[122px_640px_50px_100px]">
        <span className="inline-flex h-[34px] items-center justify-center rounded-[10px] bg-subtle px-[11px] text-[12px] leading-[1.45] font-medium whitespace-nowrap text-brand-ink">
          {t("workspaceProgress", { current, total })}
        </span>
        <span
          role="progressbar"
          aria-label={t("workspaceProgressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-[6px] w-[calc(100%-130px)] max-w-[216px] min-w-0 overflow-hidden rounded-[3px] bg-[#effbf8] md:w-auto md:max-w-none"
        >
          <span
            className="block h-full rounded-[3px] bg-[#148a7a] transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </span>
        <span className="w-[50px] text-[14px] leading-[1.45] font-semibold tabular-nums text-ink">
          {progress}%
        </span>
        <span
          aria-label={t("elapsedTimeLabel")}
          className="inline-flex w-[100px] items-center gap-2 text-[14px] leading-[1.45] font-semibold tabular-nums text-ink"
        >
          <Clock3 aria-hidden="true" className="size-3.5" />
          {formatElapsedTime(elapsedSeconds)}
        </span>
      </div>
    </>
  );
}
