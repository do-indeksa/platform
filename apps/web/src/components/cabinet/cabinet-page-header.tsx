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
    <section className="flex h-[138px] flex-col justify-between md:h-[72px] md:flex-row md:items-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] leading-[1.4] font-bold">{t("title")}</h1>
        <p className="text-sm leading-[1.4] text-muted">{t(subtitle)}</p>
      </div>
      <div
        aria-label={t("subject.aria")}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-line bg-surface px-4 md:w-[300px]"
      >
        <span className="text-xs leading-[1.4] text-muted">
          {t("subject.label")}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] leading-[1.4] font-semibold text-ink">
          {t("subject.value")}
          <ChevronDown aria-hidden className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}
