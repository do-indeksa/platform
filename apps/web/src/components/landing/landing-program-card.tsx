import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LandingProgramGroup } from "@/lib/landing";

const tagTones = [
  "bg-subtle text-brand-ink",
  "bg-[#effbf8] text-[#198754]",
  "bg-[#f1f8ff] text-brand-ink",
] as const;

const tagMarks = ["∑", "○", "</>"] as const;
const columnNames = ["first", "second", "third"] as const;

export function LandingProgramCard({
  group,
  sourceDate,
}: {
  group: LandingProgramGroup;
  sourceDate: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("landing.programs");

  return (
    <article className="flex h-[500px] w-full flex-col items-start gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:h-[350px]">
      <div className="flex h-[84px] w-full shrink-0 items-center gap-5 overflow-hidden md:h-[92px]">
        <span className="flex size-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-brand-ink bg-subtle text-lg leading-6 font-bold text-brand-ink md:size-[84px]">
          {t(`groups.${group.id}.seal`)}
        </span>
        <div className="flex h-[66px] min-w-0 flex-1 flex-col items-start gap-1.5 overflow-hidden">
          <h3 className="w-full truncate text-[22px] leading-[30px] font-semibold text-ink">
            {t(`groups.${group.id}.title`)}
          </h3>
          <p className="w-full truncate text-[15px] leading-6 text-muted">
            {t("facultyLabel")}
          </p>
        </div>
      </div>

      <div className="grid h-[304px] w-full shrink-0 grid-rows-3 gap-3 overflow-hidden md:h-[130px] md:grid-cols-3 md:grid-rows-1 md:gap-3">
        {group.programs.map((program, index) => (
          <div
            key={`${group.id}:${columnNames[index]}`}
            data-fit-container
            className="flex h-[92px] min-w-0 flex-col items-start gap-[7px] overflow-hidden md:h-[130px]"
          >
            <p
              className={`flex h-9 w-full shrink-0 items-center overflow-hidden rounded-lg px-3 text-[13px] leading-[18px] font-medium md:px-2.5 xl:px-3 ${tagTones[index]}`}
            >
              <span
                className="mr-2 shrink-0 md:mr-0.5 xl:mr-2"
                aria-hidden="true"
              >
                {tagMarks[index]}
              </span>
              <span
                data-fit-text
                title={t(`groups.${group.id}.columns.${columnNames[index]}`)}
                className={`min-w-0 whitespace-nowrap xl:text-[13px] ${
                  locale === "ru" ? "md:text-[11px]" : "md:text-xs"
                }`}
              >
                {t(`groups.${group.id}.columns.${columnNames[index]}`)}
              </span>
            </p>
            {program ? (
              <p
                data-fit-text
                title={program}
                className="w-full text-[13px] leading-[19px] text-ink"
              >
                • {program}
              </p>
            ) : (
              <p className="w-full text-[13px] leading-[19px] text-ink">
                {t("formatFact")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="h-px w-full shrink-0 bg-line" />
      <Link
        href="/faculties/ftn"
        title={t("sourceTitle", { date: sourceDate })}
        className="inline-flex min-h-5 items-center gap-1.5 text-sm leading-5 text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {t("openPrograms")}
        <ArrowRight aria-hidden size={14} strokeWidth={1.8} />
      </Link>
    </article>
  );
}
