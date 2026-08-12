"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PrepPositionDefinition } from "@/lib/prep-plan";

export function PrepPlanLoadingPositions({
  positions,
}: {
  positions: readonly PrepPositionDefinition[];
}) {
  const t = useTranslations("prep");

  return (
    <section
      data-testid="prep-loading-positions"
      aria-hidden="true"
      className="min-w-0"
    >
      <div className="hidden h-[34px] grid-cols-[36px_minmax(280px,1fr)_130px_69px_28px_5px] items-center gap-4 bg-subtle px-[18px] text-xs leading-4 font-medium text-muted lg:grid">
        <span className="col-span-2">{t("tablePosition")}</span>
        <span>{t("tableProgress")}</span>
        <span>{t("tableStatus")}</span>
        <span className="text-right">{t("tableEvidence")}</span>
      </div>
      <ol className="flex flex-col lg:mt-4">
        {positions.map((position) => (
          <li
            key={position.number}
            data-testid={`prep-loading-position-${position.number}`}
            className="h-[124px] overflow-hidden rounded-xl border border-line bg-surface lg:h-[66px] lg:rounded-none"
          >
            <div className="flex h-[122px] w-full min-w-0 flex-col gap-0.5 px-[11px] py-[9px] lg:grid lg:h-16 lg:grid-cols-[36px_minmax(280px,1fr)_130px_69px_28px_5px] lg:items-center lg:gap-4 lg:px-[17px] lg:py-0">
              <span className="flex h-[60px] min-w-0 shrink-0 items-start gap-2.5 overflow-hidden lg:contents">
                <span className="mt-[9px] flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-subtle text-sm leading-5 font-semibold text-brand-ink lg:mt-0">
                  {position.number}
                </span>
                <span className="mt-0.5 h-[58px] min-w-0 flex-1 overflow-hidden lg:mt-0 lg:block lg:h-auto">
                  <span className="line-clamp-2 block text-sm leading-5 font-semibold text-ink lg:line-clamp-1">
                    {position.name}
                  </span>
                  <span className="mt-0.5 block h-4 overflow-hidden text-xs leading-4 font-medium text-ellipsis whitespace-nowrap text-muted">
                    {position.description}
                  </span>
                </span>
                <ChevronRight
                  className="mt-[15px] h-4 w-4 shrink-0 text-muted lg:order-[6] lg:mt-0"
                  strokeWidth={1.8}
                />
              </span>

              <span className="flex h-10 min-w-0 items-center gap-2.5 lg:contents">
                <span className="flex h-[38px] w-[116px] shrink-0 animate-pulse flex-col gap-2 lg:order-[3] lg:w-[130px]">
                  <span className="h-3 w-10 rounded bg-brand/10" />
                  <span className="h-[5px] w-full rounded-[3px] bg-line" />
                </span>
                <span className="h-[26px] w-20 shrink-0 animate-pulse rounded-[7px] bg-brand/10 lg:order-[4]" />
                <span className="ml-auto h-3 w-14 animate-pulse rounded bg-brand/10 lg:order-[5] lg:ml-0" />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
