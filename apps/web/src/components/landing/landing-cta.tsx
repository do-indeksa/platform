import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { LandingButton } from "./landing-button";

const mobileCtaHeights: Record<AppLocale, string> = {
  sr: "h-[460px]",
  en: "h-[483px]",
  ru: "h-[521px]",
};

const mobileContentHeights: Record<AppLocale, string> = {
  sr: "h-[168px]",
  en: "h-[191px]",
  ru: "h-[229px]",
};

const mobileTitleHeights: Record<AppLocale, string> = {
  sr: "h-[38px]",
  en: "h-[38px]",
  ru: "h-[76px]",
};

const mobileBodyHeights: Record<AppLocale, string> = {
  sr: "h-[46px]",
  en: "h-[69px]",
  ru: "h-[69px]",
};

const mobileBodyLines: Record<AppLocale, readonly string[]> = {
  sr: ["mobileLine1", "mobileLine2"],
  en: ["mobileLine1", "mobileLine2", "mobileLine3"],
  ru: ["mobileLine1", "mobileLine2", "mobileLine3"],
};

export function LandingCta() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("landing.cta");

  return (
    <section
      id="start"
      aria-labelledby="landing-cta-title"
      className={`flex w-full flex-col items-center justify-between overflow-hidden rounded-3xl bg-subtle px-6 py-9 md:h-[300px] md:flex-row md:px-12 ${mobileCtaHeights[locale]}`}
    >
      <div
        className={`flex w-full shrink-0 flex-col items-start gap-4 overflow-hidden md:h-[220px] md:w-[500px] md:justify-center xl:w-[620px] ${mobileContentHeights[locale]}`}
      >
        <h2
          id="landing-cta-title"
          className={`w-full shrink-0 text-[30px] leading-[38px] font-bold text-ink md:h-[38px] ${mobileTitleHeights[locale]}`}
        >
          {t("title")}
        </h2>
        <p
          className={`w-full shrink-0 text-[15px] leading-[23px] text-muted md:h-[46px] ${mobileBodyHeights[locale]}`}
        >
          <span className="md:hidden">
            {mobileBodyLines[locale].map((key) => (
              <span key={key} className="block">
                {t(key)}
              </span>
            ))}
          </span>
          <span className="hidden md:block">
            <span className="block">{t("desktopLine1")}</span>
            <span className="block">{t("desktopLine2")}</span>
          </span>
        </p>
        <LandingButton href="/tasks">{t("button")}</LandingButton>
      </div>

      <div className="relative h-[220px] w-[280px] shrink-0 md:h-[250px] md:w-[300px] xl:w-[430px]">
        <Image
          src="/marketing/cta-3d.png"
          alt=""
          fill
          sizes="(min-width: 1280px) 430px, (min-width: 768px) 300px, 280px"
          className="object-contain"
        />
      </div>
    </section>
  );
}
