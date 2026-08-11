import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LandingProgramGroup } from "@/lib/landing";
import { LandingCta } from "./landing-cta";
import { LandingFeatureCard } from "./landing-feature-card";
import { LandingFlowCard } from "./landing-flow-card";
import { LandingHero } from "./landing-hero";
import { LandingProgramCard } from "./landing-program-card";
import { LandingStep } from "./landing-step";

const mobileFlowHeights: Record<AppLocale, string> = {
  sr: "h-[874px]",
  en: "h-[908px]",
  ru: "h-[908px]",
};

const mobileFlowHeadingHeights: Record<AppLocale, string> = {
  sr: "h-[54px]",
  en: "h-[88px]",
  ru: "h-[88px]",
};

const mobileProgramHeights: Record<AppLocale, string> = {
  sr: "h-[2276px]",
  en: "h-[2332px]",
  ru: "h-[2312px]",
};

const mobileProgramHeadingHeights: Record<AppLocale, string> = {
  sr: "h-[100px]",
  en: "h-[156px]",
  ru: "h-[136px]",
};

export function Landing({
  exam,
  publishedTaskCount,
  programGroups,
  programSourceDate,
}: {
  exam: {
    taskCount: number;
    durationMinutes: number;
    maxPoints: number;
  };
  publishedTaskCount: number;
  programGroups: LandingProgramGroup[];
  programSourceDate: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("landing");
  const hours = exam.durationMinutes / 60;

  return (
    <main
      data-testid="marketing-landing"
      className="mx-auto w-full max-w-[1440px] px-4 pb-12 md:px-14 md:pb-20 xl:px-20"
    >
      <LandingHero />

      <section
        id="features"
        aria-label={t("benefits.label")}
        className="grid h-[912px] w-full grid-cols-1 gap-4 overflow-hidden md:h-[448px] md:grid-cols-2 xl:h-60 xl:grid-cols-[repeat(4,296px)] xl:content-center"
      >
        <LandingFeatureCard type="guest" title={t("benefits.guest.title")}>
          <span className="block">{t("benefits.guest.line1")}</span>
          <span className="block">{t("benefits.guest.line2")}</span>
        </LandingFeatureCard>
        <LandingFeatureCard type="tasks" title={t("benefits.tasks.title")}>
          <span className="block">
            {t("benefits.tasks.line1", { count: publishedTaskCount })}
          </span>
          <span className="block">{t("benefits.tasks.line2")}</span>
        </LandingFeatureCard>
        <LandingFeatureCard type="plan" title={t("benefits.plan.title")}>
          <span className="block">{t("benefits.plan.line1")}</span>
          <span className="block">{t("benefits.plan.line2")}</span>
        </LandingFeatureCard>
        <LandingFeatureCard type="mock" title={t("benefits.mock.title")}>
          <span className="block">{t("benefits.mock.line1", { hours })}</span>
          <span className="block">
            {t("benefits.mock.line2", { points: exam.maxPoints })}
          </span>
        </LandingFeatureCard>
      </section>

      <section
        id="p1-paths"
        aria-labelledby="landing-flows-title"
        className={`flex w-full flex-col items-start gap-6 overflow-hidden py-11 md:h-[392px] ${mobileFlowHeights[locale]}`}
      >
        <div
          className={`flex w-full shrink-0 flex-col justify-between overflow-hidden md:h-10 md:flex-row md:items-center ${mobileFlowHeadingHeights[locale]}`}
        >
          <h2
            id="landing-flows-title"
            className="w-full text-[26px] leading-[34px] font-bold text-ink md:w-auto"
          >
            {t("flows.title")}
          </h2>
          <Link
            href="/exams?q=P1"
            className="inline-flex min-h-5 items-center gap-1.5 text-sm leading-5 text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("flows.all")}
            <ArrowRight aria-hidden size={14} strokeWidth={1.8} />
          </Link>
        </div>
        <div className="grid h-[708px] w-full shrink-0 grid-cols-1 gap-6 overflow-hidden md:h-60 md:grid-cols-[repeat(3,288px)] xl:grid-cols-[repeat(3,400px)]">
          <LandingFlowCard
            href="/tasks"
            title={t("flows.practice.title")}
            subtitle={t("flows.practice.subtitle", {
              count: publishedTaskCount,
            })}
            status={t("flows.practice.status")}
            tone="lavender"
          />
          <LandingFlowCard
            href="/diagnostic"
            title={t("flows.diagnostic.title")}
            subtitle={t("flows.diagnostic.subtitle", {
              count: exam.taskCount,
            })}
            status={t("flows.diagnostic.status")}
            tone="mint"
          />
          <LandingFlowCard
            href="/simulation"
            title={t("flows.mock.title")}
            subtitle={t("flows.mock.subtitle", { hours })}
            status={t("flows.mock.status", { points: exam.maxPoints })}
            tone="sky"
          />
        </div>
      </section>

      <section
        id="ftn-programs"
        aria-labelledby="landing-programs-title"
        className={`flex w-full flex-col items-start gap-6 overflow-hidden py-10 md:h-[888px] ${mobileProgramHeights[locale]}`}
      >
        <div
          className={`flex w-full shrink-0 flex-col justify-between overflow-hidden md:h-[60px] md:flex-row md:items-center ${mobileProgramHeadingHeights[locale]}`}
        >
          <div className="flex min-w-0 flex-col items-start gap-1 md:h-[60px] md:w-[760px] xl:w-[920px]">
            <h2
              id="landing-programs-title"
              className="w-full text-[28px] leading-9 font-bold text-ink"
            >
              {t("programs.title")}
            </h2>
            <p className="w-full text-[15px] leading-5 text-muted">
              {t("programs.description", {
                count: programGroups.reduce(
                  (total, group) =>
                    total + group.programs.filter(Boolean).length,
                  0,
                ),
              })}
            </p>
          </div>
          <Link
            href="/faculties/ftn"
            className="inline-flex min-h-5 items-center gap-1.5 text-sm leading-5 text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("programs.all")}
            <ArrowRight aria-hidden size={14} strokeWidth={1.8} />
          </Link>
        </div>
        <div className="grid h-[2072px] w-full shrink-0 grid-cols-1 gap-6 overflow-hidden md:h-[724px] md:grid-cols-2 md:grid-rows-2">
          {programGroups.map((group) => (
            <LandingProgramCard
              key={group.id}
              group={group}
              sourceDate={programSourceDate}
            />
          ))}
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="landing-steps-title"
        className="flex h-[750px] w-full flex-col items-start gap-6 overflow-hidden pt-9 md:h-[286px]"
      >
        <h2
          id="landing-steps-title"
          className="text-[26px] leading-[34px] font-bold text-ink"
        >
          {t("steps.title")}
        </h2>
        <div className="grid h-[656px] w-full grid-cols-1 gap-4 overflow-hidden md:h-[152px] md:grid-cols-4 xl:grid-cols-[repeat(4,296px)]">
          {[1, 2, 3, 4].map((number) => (
            <LandingStep
              key={number}
              number={number}
              title={t(`steps.items.${number}.title`)}
              body={t(`steps.items.${number}.body`)}
              final={number === 4}
            />
          ))}
        </div>
      </section>

      <LandingCta />
    </main>
  );
}
