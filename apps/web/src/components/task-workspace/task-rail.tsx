"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { TaskWorkspaceItem, TaskWorkspaceStatus } from "./types";

export function TaskRail({
  items,
  currentTaskId,
  statuses,
  durations,
  returnTo,
}: {
  items: readonly TaskWorkspaceItem[];
  currentTaskId: string;
  statuses: Readonly<Record<string, TaskWorkspaceStatus>>;
  durations: Readonly<Record<string, number>>;
  returnTo: string;
}) {
  const t = useTranslations("tasks");

  return (
    <aside
      aria-label={t("taskRailTitle")}
      data-testid="task-workspace-rail"
      className="flex h-[94px] min-w-0 items-center gap-2 rounded-[18px] border border-line bg-surface p-4 md:h-[104px] md:gap-[10px] xl:h-[500px] xl:w-[250px] xl:flex-col xl:items-start xl:gap-[14px] xl:p-[18px]"
    >
      <h2 className="hidden shrink-0 text-[18px] leading-[1.45] font-semibold text-ink md:block md:w-20 xl:w-[210px]">
        {t("taskRailTitle")}
      </h2>
      <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] md:gap-[10px] xl:w-full xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => {
          const current = item.id === currentTaskId;
          const status = current
            ? (statuses[item.id] ?? "active")
            : (statuses[item.id] ?? "pending");
          const visibleStatus =
            current && status === "pending" ? "active" : status;
          const durationMs = durations[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={current ? "step" : undefined}
              aria-label={t("taskRailItemLabel", {
                number: index + 1,
                status: t(`taskStatus.${visibleStatus}`),
              })}
              className={`flex h-14 w-14 shrink-0 items-center gap-[10px] rounded-[12px] px-[11px] py-3 transition-colors md:h-16 md:w-[126px] md:px-2 xl:h-[58px] xl:w-[214px] xl:px-3 ${
                current ? "border border-line bg-subtle" : "hover:bg-page"
              }`}
            >
              <span
                className={`inline-flex size-[34px] shrink-0 items-center justify-center rounded-full text-[14px] leading-[1.45] font-semibold ${numberTone(
                  visibleStatus,
                  current,
                )}`}
              >
                {index + 1}
              </span>
              <span className="hidden min-w-0 flex-col gap-px md:flex md:w-[72px] xl:w-[112px]">
                <span
                  className={`text-[12px] leading-[1.45] font-medium ${statusTone(
                    visibleStatus,
                  )}`}
                >
                  {t(`taskStatus.${visibleStatus}`)}
                </span>
                {durationMs !== undefined && visibleStatus !== "pending" && (
                  <span className="text-[10px] leading-[1.45] font-normal text-muted">
                    {t("taskDuration", durationParts(durationMs))}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>
      <Link
        href={returnTo}
        className="mt-auto hidden h-[46px] w-[214px] shrink-0 items-center justify-center rounded-[11px] border border-line bg-surface px-3 text-[13px] leading-[1.45] font-medium text-ink transition-colors hover:bg-page xl:inline-flex"
      >
        {t("finishPractice")}
      </Link>
    </aside>
  );
}

function durationParts(durationMs: number): {
  minutes: number;
  seconds: number;
} {
  const totalSeconds = Math.floor(durationMs / 1_000);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

function numberTone(status: TaskWorkspaceStatus, current: boolean): string {
  if (status === "solved") return "bg-[#edfaf3] text-[#198754]";
  if (status === "retry") return "bg-[#fff7e8] text-[#9a6700]";
  if (status === "skipped") return "bg-zinc-100 text-muted";
  if (current || status === "active") return "bg-surface text-brand-ink";
  return "bg-subtle text-ink";
}

function statusTone(status: TaskWorkspaceStatus): string {
  if (status === "solved") return "text-[#198754]";
  if (status === "retry") return "text-[#9a6700]";
  if (status === "active") return "text-brand-ink";
  return "text-muted";
}
