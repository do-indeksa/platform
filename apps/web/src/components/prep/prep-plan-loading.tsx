"use client";

import { useTranslations } from "next-intl";
import type { PrepPositionDefinition } from "@/lib/prep-plan";
import { PrepPlanLoadingFacts } from "./prep-plan-loading-facts";
import { PrepPlanLoadingPositions } from "./prep-plan-loading-positions";
import { PrepPlanLoadingSummary } from "./prep-plan-loading-summary";

export function PrepPlanLoading({
  positions,
}: {
  positions: readonly PrepPositionDefinition[];
}) {
  const t = useTranslations("prep");

  return (
    <main
      data-testid="prep-plan"
      data-state="loading"
      data-design-status="provisional"
      aria-busy="true"
      aria-describedby="prep-loading-status"
      className="mx-auto w-full max-w-[1304px] px-4 pt-4 pb-6 lg:px-8 lg:pt-[26px] lg:pb-12"
    >
      <p
        id="prep-loading-status"
        data-testid="prep-loading-status"
        role="status"
        className="sr-only"
      >
        {t("loading")}
      </p>

      <div className="flex min-w-0 flex-col gap-3.5 lg:gap-4">
        <header className="min-w-0">
          <h1 className="text-[22px] leading-[30px] font-semibold text-ink lg:text-[32px] lg:leading-10 lg:font-bold">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm leading-5 text-muted">
            {t("subtitle", { count: positions.length })}
          </p>
        </header>

        <PrepPlanLoadingSummary />
        <LoadingTabs />
        <PrepPlanLoadingPositions positions={positions} />
        <PrepPlanLoadingFacts />
      </div>
    </main>
  );
}

function LoadingTabs() {
  return (
    <div
      data-testid="prep-loading-tabs"
      aria-hidden="true"
      className="flex h-12 min-w-0 items-center justify-between gap-3"
    >
      <div className="flex min-w-0 items-start gap-1">
        <span className="h-9 w-24 animate-pulse rounded-[9px] bg-subtle sm:w-28" />
        <span className="h-9 w-20 animate-pulse rounded-[9px] bg-brand/10 sm:w-24" />
        <span className="h-9 w-20 animate-pulse rounded-[9px] bg-brand/10 sm:w-24" />
      </div>
      <span className="hidden h-4 w-32 animate-pulse rounded bg-brand/10 sm:block" />
    </div>
  );
}
