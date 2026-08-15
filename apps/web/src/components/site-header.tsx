"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { DesktopNavigation } from "@/components/app-navigation";
import { HeaderUser } from "@/components/header-user";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileMenu } from "@/components/mobile-menu";
import { Link, usePathname } from "@/i18n/navigation";

export function SiteHeader({
  placement = "application",
}: {
  placement?: "application" | "landing";
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const landing = placement === "landing";

  return (
    <header
      data-testid="site-header"
      data-placement={placement}
      className={`sticky top-0 z-40 bg-surface after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-line after:content-[''] ${
        landing ? "mx-4 h-16 md:mx-14 md:h-[72px] xl:mx-20" : "h-16 xl:h-[72px]"
      }`}
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
          <Image
            aria-hidden
            data-testid="app-header-indicator"
            src="/app-header/indicator.svg"
            alt=""
            width={36}
            height={36}
            unoptimized
            className="size-9 shrink-0"
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
