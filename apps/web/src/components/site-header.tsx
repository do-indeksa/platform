"use client";

import { useLocale, useTranslations } from "next-intl";
import { DesktopNavigation } from "@/components/app-navigation";
import { HeaderUser } from "@/components/header-user";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileMenu } from "@/components/mobile-menu";
import { Link, usePathname } from "@/i18n/navigation";

export function SiteHeader() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 h-16 bg-surface after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-line after:content-[''] xl:h-[72px]"
    >
      <div className="relative flex h-full w-full items-center justify-between px-4 md:px-8">
        <div className="flex h-full min-w-0 items-center gap-6 overflow-hidden xl:gap-[46px]">
          <Link
            href="/"
            aria-label={t("brandHome")}
            className="flex h-11 w-[94px] shrink-0 items-center text-[18px] font-bold whitespace-nowrap text-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-[105px] md:text-xl"
          >
            do indeksa
          </Link>
          <DesktopNavigation />
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-2 md:gap-3">
          <span
            aria-hidden="true"
            data-design-status="provisional"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-[14px] leading-normal font-medium text-ink"
          />
          <div className="md:hidden">
            <LanguageSwitcher compact />
          </div>
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>
          <div className="hidden md:block">
            <HeaderUser />
          </div>
          <MobileMenu key={`${locale}:${pathname}`} />
        </div>
      </div>
    </header>
  );
}
