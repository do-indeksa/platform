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
      className="flex h-[704px] flex-col rounded-[20px] border border-line bg-surface p-6 md:h-[344px] md:p-7 xl:h-[330px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="cabinet-programs-title"
            className="text-xl leading-7 font-bold md:text-2xl md:leading-8"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-muted md:text-sm">
            {t("intro", { count: programs.length })}
          </p>
        </div>
        <Link
          href="/faculties/ftn"
          className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-brand hover:underline md:text-sm"
        >
          {t("all")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-[23px] grid gap-[14px] md:mt-5 md:grid-cols-3 md:gap-4">
        {visible.map((program) => (
          <article
            key={program.name}
            className="flex h-[124px] min-w-0 items-start gap-3 rounded-xl border border-line p-4 md:h-[130px]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-bold text-brand">
              {program.code}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand">
                {t("card.eyebrow")}
              </p>
              <h3 className="mt-1 line-clamp-2 text-sm leading-5 font-bold">
                {program.name}
              </h3>
              <p className="mt-1 text-[11px] text-muted">{t("card.meta")}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex h-[142px] flex-col justify-between gap-3 rounded-xl bg-subtle p-4 md:mt-auto md:min-h-[70px] md:flex-row md:items-center md:px-5 md:py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{t("cta.title")}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted md:text-xs">
            {t("cta.description")}
          </p>
        </div>
        <CabinetLinkButton
          href="/faculties/ftn"
          className="w-full shrink-0 md:w-[220px]"
        >
          {t("cta.button")}
        </CabinetLinkButton>
      </div>
    </section>
  );
}
