"use client";

import { Ellipsis } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { HeaderUser } from "@/components/header-user";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  MarketingMobileMenu,
  type MarketingLink,
} from "@/components/marketing-mobile-menu";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export function MarketingHeader() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("landing.header");
  const overflowMenu = useRef<HTMLDetailsElement>(null);
  const items: MarketingLink[] = [
    { href: "/#p1-paths", label: t("exams") },
    { href: "/#about-platform", label: t("about") },
    { href: "/#features", label: t("features") },
    { href: "/#ftn-programs", label: t("faculties") },
    { href: "/#how-it-works", label: t("aboutUs") },
  ];

  return (
    <header
      data-testid="marketing-header"
      className="relative z-40 mx-auto w-full max-w-[1440px] px-4 md:px-14 xl:px-20"
    >
      <div
        data-testid="marketing-header-inner"
        className="flex h-16 w-full items-center justify-between border-b border-line bg-surface md:h-20 md:border-0 md:bg-page xl:h-[92px]"
      >
        <Link
          href="/"
          aria-label={t("brandHome")}
          className="shrink-0 text-lg leading-normal font-bold whitespace-nowrap text-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-[125px] md:text-2xl md:leading-8"
        >
          do indeksa
        </Link>

        <nav
          aria-label={t("navigation")}
          className="hidden shrink-0 items-center gap-7 overflow-hidden text-sm leading-5 text-ink md:flex xl:gap-10"
        >
          <MarketingNavLink item={items[0]} width="w-[68px]" />
          <MarketingNavLink item={items[1]} width="w-[90px]" />
          <MarketingNavLink
            item={items[2]}
            width={locale === "ru" ? "w-24" : "w-[93px]"}
          />
          <div className="hidden xl:contents">
            <MarketingNavLink
              item={items[3]}
              width={locale === "ru" ? "w-[85px]" : "w-20"}
            />
            <MarketingNavLink
              item={items[4]}
              width={locale === "en" ? "w-10" : "w-[38px]"}
            />
          </div>
          <details
            ref={overflowMenu}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                event.currentTarget.removeAttribute("open");
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.currentTarget.removeAttribute("open");
              event.currentTarget.querySelector("summary")?.focus();
            }}
            className="group relative w-20 shrink-0 xl:hidden"
          >
            <summary
              title={t("more")}
              className="flex h-11 cursor-pointer list-none items-center px-0 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
            >
              <Ellipsis aria-hidden size={20} strokeWidth={1.8} />
              <span className="sr-only">{t("more")}</span>
            </summary>
            <div className="absolute top-12 right-0 z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
              {items.slice(3).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => overflowMenu.current?.removeAttribute("open")}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="hidden shrink-0 items-center justify-center gap-3 md:flex">
          <LanguageSwitcher />
          <HeaderUser placement="marketing" />
        </div>

        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <LanguageSwitcher compact />
          <MarketingMobileMenu items={items} menuLabel={t("menu")} />
        </div>
      </div>
    </header>
  );
}

function MarketingNavLink({
  item,
  width,
}: {
  item: MarketingLink;
  width: string;
}) {
  return (
    <Link
      href={item.href}
      data-fit-text
      className={`shrink-0 font-normal hover:text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${width}`}
    >
      {item.label}
    </Link>
  );
}
