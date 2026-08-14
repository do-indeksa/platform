"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cabinetProgram } from "./cabinet-model";
import { CabinetLinkButton } from "./cabinet-link-button";

export function CabinetPrograms({ programs }: { programs: readonly string[] }) {
  const t = useTranslations("cabinet.programs");
  const visible = programs.slice(0, 3).map(cabinetProgram);

  return (
    <section
      data-testid="cabinet-programs"
      aria-labelledby="cabinet-programs-title"
      className="flex h-[704px] flex-col items-start gap-[18px] overflow-hidden rounded-[20px] border border-line bg-surface p-6 md:h-[344px] md:p-7 xl:h-[330px]"
    >
      <div className="flex h-[54px] w-full items-start justify-between gap-3 md:h-11">
        <div>
          <h2
            id="cabinet-programs-title"
            className="text-[22px] leading-[1.4] font-semibold"
          >
            {t("title")}
          </h2>
          <p className="mt-[3px] text-xs leading-[1.4] text-muted md:text-[13px]">
            {t("intro", { count: programs.length })}
          </p>
        </div>
        <Link
          href="/faculties/ftn"
          className="inline-flex shrink-0 items-center gap-2 text-[13px] leading-[1.4] font-medium text-brand-ink hover:underline"
        >
          {t("all")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid h-[402px] w-full gap-3 md:h-[130px] md:grid-cols-3 md:gap-4">
        {visible.map((program) => (
          <article
            key={program.name}
            className="flex h-[126px] min-w-0 items-start gap-3 overflow-hidden rounded-[14px] border border-line p-4 md:h-[130px]"
          >
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] leading-[1.4] font-bold text-brand-ink">
              {program.code}
            </span>
            <div className="min-w-0">
              <p className="text-xs leading-[1.4] font-semibold text-brand-ink">
                {t("card.eyebrow")}
              </p>
              <h3 className="mt-1 line-clamp-2 text-sm leading-5 font-semibold">
                {program.name}
              </h3>
              <p className="mt-1 text-[11px] text-muted">{t("card.meta")}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="flex h-[142px] w-full flex-col gap-4 rounded-[14px] bg-subtle p-4 md:h-[70px] md:flex-row md:items-center md:justify-between md:gap-3 md:px-[18px] md:py-[11px]">
        <div className="min-w-0">
          <p className="text-sm leading-[1.4] font-semibold">
            {t("cta.title")}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted md:text-xs">
            {t("cta.description")}
          </p>
        </div>
        <CabinetLinkButton
          href="/faculties/ftn"
          className="w-full shrink-0 md:w-[220px]"
          compactOnMobile
        >
          {t("cta.button")}
        </CabinetLinkButton>
      </div>
    </section>
  );
}
