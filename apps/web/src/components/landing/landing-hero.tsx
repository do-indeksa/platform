import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { LandingButton } from "./landing-button";

const mobileContentHeights: Record<AppLocale, string> = {
  sr: "h-[396px]",
  en: "h-[426px]",
  ru: "h-[456px]",
};

const mobileHeroHeights: Record<AppLocale, string> = {
  sr: "h-[736px]",
  en: "h-[766px]",
  ru: "h-[796px]",
};

const mobileBodyHeights: Record<AppLocale, string> = {
  sr: "h-[60px]",
  en: "h-[90px]",
  ru: "h-[120px]",
};

const mobileBodyLines: Record<AppLocale, readonly string[]> = {
  sr: ["mobileLine1", "mobileLine2"],
  en: ["mobileLine1", "mobileLine2", "mobileLine3"],
  ru: ["mobileLine1", "mobileLine2", "mobileLine3", "mobileLine4"],
};

export function LandingHero() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("landing.hero");

  return (
    <section
      id="about-platform"
      aria-labelledby="landing-title"
      className={`flex w-full flex-col items-center justify-between overflow-hidden md:h-[620px] md:flex-row ${mobileHeroHeights[locale]}`}
    >
      <div
        className={`flex w-full shrink-0 flex-col items-start gap-6 overflow-hidden md:h-[520px] md:w-[520px] md:justify-center xl:w-[650px] ${mobileContentHeights[locale]}`}
      >
        <p className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg bg-subtle px-3 py-[7px] text-[13px] leading-[18px] text-brand-ink">
          {t("eyebrow")}
        </p>
        <h1
          id="landing-title"
          className="flex h-28 w-full shrink-0 flex-col overflow-hidden text-[44px] leading-[52px] font-extrabold md:h-36 md:text-[64px] md:leading-[72px]"
        >
          <span className="block w-full text-ink">{t("titlePrimary")}</span>
          <span className="block w-full bg-gradient-to-r from-[#6b36f3] to-[#4b22d5] bg-clip-text text-transparent">
            {t("titleAccent")}
          </span>
        </h1>
        <p
          className={`w-full shrink-0 text-lg leading-[30px] text-ink md:h-[60px] md:w-[500px] xl:w-[610px] ${mobileBodyHeights[locale]}`}
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
        <div className="flex h-[120px] w-full shrink-0 flex-col items-start gap-4 overflow-hidden md:h-[52px] md:w-auto md:flex-row">
          <LandingButton href="/tasks" mobileFullWidth>
            {t("start")}
          </LandingButton>
          <LandingButton href="#p1-paths" variant="secondary" mobileFullWidth>
            {t("choose")}
          </LandingButton>
        </div>
      </div>

      <div className="relative mx-auto size-[340px] shrink-0 overflow-hidden rounded-[40px] md:mx-0 md:h-[520px] md:w-[380px] xl:size-[550px]">
        <Image
          src="/marketing/hero-3d.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 550px, (min-width: 768px) 380px, 340px"
          className="object-contain"
        />
      </div>
    </section>
  );
}
