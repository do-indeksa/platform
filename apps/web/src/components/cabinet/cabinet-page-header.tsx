"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

export type CabinetPageState = "loading" | "empty" | "started";

export function CabinetPageHeader({ state }: { state: CabinetPageState }) {
  const t = useTranslations("cabinet");
  const subtitle =
    state === "loading"
      ? "subtitle.loading"
      : state === "started"
        ? "subtitle.started"
        : "subtitle.empty";

  return (
    <section className="flex min-h-[138px] flex-col justify-between gap-3 md:min-h-[72px] md:flex-row md:items-start">
      <div>
        <h1 className="text-[26px] leading-8 font-bold md:text-[34px] md:leading-[42px]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">{t(subtitle)}</p>
      </div>
      <div
        aria-label={t("subject.aria")}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-line bg-surface px-4 text-xs md:w-[300px] md:text-sm"
      >
        <span className="text-muted">{t("subject.label")}</span>
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          {t("subject.value")}
          <ChevronDown aria-hidden className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}
