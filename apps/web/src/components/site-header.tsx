"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  DesktopNavigation,
  MobileBottomNavigation,
} from "@/components/app-navigation";
import { HeaderUser } from "@/components/header-user";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileMenu } from "@/components/mobile-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { examCodeFromPathname } from "@/lib/app-routes";

export function SiteHeader() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const examT = useTranslations("examCatalog");
  const contextualExamCode = examCodeFromPathname(pathname);
  const examLabel = contextualExamCode
    ? `${contextualExamCode} · ${examT(`names.${contextualExamCode}`)}`
    : t("exam");

  return (
    <>
      <header
        data-testid="site-header"
        className="sticky top-0 z-40 h-16 border-b border-line bg-surface"
      >
        <div className="relative mx-auto flex h-full w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:gap-5 lg:px-8">
          <Link
            href="/"
            aria-label={t("brandHome")}
            className="inline-flex min-h-11 shrink-0 items-center text-xl font-bold text-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            do indeksa
          </Link>
          <Link
            href="/exams"
            aria-label={t("exams")}
            className="hidden min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-subtle px-3 text-xs font-semibold text-brand-ink transition-colors hover:bg-subtle-hover xl:flex"
          >
            {examLabel}
            <ChevronDown aria-hidden size={14} strokeWidth={1.8} />
          </Link>
          <DesktopNavigation />
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
            <div className="lg:hidden">
              <LanguageSwitcher compact />
            </div>
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
            <HeaderUser />
          </div>
          <Link
            href="/exams"
            aria-label={t("exams")}
            className="ml-auto flex min-h-11 min-w-0 max-w-40 items-center gap-1 rounded-lg bg-subtle px-2.5 text-xs font-semibold text-brand-ink md:hidden"
          >
            <span className="truncate">{examLabel}</span>
            <ChevronDown aria-hidden size={14} className="shrink-0" />
          </Link>
          <MobileMenu key={`${locale}:${pathname}`} />
        </div>
      </header>
      <MobileBottomNavigation />
    </>
  );
}
