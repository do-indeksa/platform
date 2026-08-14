"use client";

import {
  BookOpenCheck,
  Calculator,
  ClipboardList,
  History,
  LayoutDashboard,
  LibraryBig,
  Map,
  MoreHorizontal,
  University,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { isNavigationItemActive } from "@/lib/app-routes";

type NavigationKey =
  | "overview"
  | "preparation"
  | "prep"
  | "tasks"
  | "training"
  | "simulation"
  | "history"
  | "exams"
  | "faculties"
  | "calculator"
  | "favorites";

type NavigationItem = {
  href: string;
  key: NavigationKey;
  icon: LucideIcon;
  headerWidths?: Record<AppLocale, string>;
};

const headerPrimaryItems: NavigationItem[] = [
  {
    href: "/cabinet",
    key: "preparation",
    icon: LayoutDashboard,
    headerWidths: {
      sr: "w-20 xl:w-[87px]",
      en: "w-[86px] xl:w-[93px]",
      ru: "w-[93px] xl:w-[101px]",
    },
  },
  {
    href: "/tasks",
    key: "tasks",
    icon: ClipboardList,
    headerWidths: {
      sr: "w-[37px] xl:w-[41px]",
      en: "w-8 xl:w-[34px]",
      ru: "w-[49px] xl:w-[53px]",
    },
  },
  {
    href: "/simulation",
    key: "training",
    icon: BookOpenCheck,
    headerWidths: {
      sr: "w-[52px] xl:w-14",
      en: "w-[45px] xl:w-[49px]",
      ru: "w-[69px] xl:w-[75px]",
    },
  },
];

const headerDesktopItems: NavigationItem[] = [
  {
    href: "/prep",
    key: "prep",
    icon: Map,
    headerWidths: {
      sr: "w-[84px]",
      en: "w-[66px]",
      ru: "w-[107px]",
    },
  },
  {
    href: "/history",
    key: "history",
    icon: History,
    headerWidths: {
      sr: "w-[42px]",
      en: "w-[45px]",
      ru: "w-[53px]",
    },
  },
  {
    href: "/faculties/ftn",
    key: "faculties",
    icon: University,
    headerWidths: {
      sr: "w-[52px]",
      en: "w-[54px]",
      ru: "w-[74px]",
    },
  },
];

const tabletOverflowItems: NavigationItem[] = [
  ...headerDesktopItems,
  { href: "/exams", key: "exams", icon: LibraryBig },
  {
    href: "/calculator",
    key: "calculator",
    icon: Calculator,
  },
];

const mobileItems: NavigationItem[] = [
  { href: "/cabinet", key: "overview", icon: LayoutDashboard },
  { href: "/tasks", key: "tasks", icon: ClipboardList },
  { href: "/prep", key: "prep", icon: Map },
  {
    href: "/simulation",
    key: "simulation",
    icon: BookOpenCheck,
  },
  { href: "/history", key: "history", icon: History },
  { href: "/exams", key: "exams", icon: LibraryBig },
  {
    href: "/faculties/ftn",
    key: "faculties",
    icon: University,
  },
  {
    href: "/calculator",
    key: "calculator",
    icon: Calculator,
  },
];

const favoritesWidths: Record<AppLocale, string> = {
  sr: "w-[53px]",
  en: "w-[57px]",
  ru: "w-[69px]",
};

export function DesktopNavigation() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const t = useTranslations("nav");
  const moreMenu = useRef<HTMLDetailsElement>(null);

  return (
    <nav
      data-testid="desktop-navigation"
      aria-label={t("navigation")}
      className="hidden h-full min-w-0 items-center gap-5 md:flex xl:gap-[22px]"
    >
      {headerPrimaryItems.map((item) => (
        <HeaderLink
          key={item.href}
          item={item}
          active={isNavigationItemActive(pathname, item.href)}
          label={t(item.key)}
          locale={locale}
        />
      ))}

      {headerDesktopItems.map((item) => (
        <HeaderLink
          key={item.href}
          item={item}
          active={isNavigationItemActive(pathname, item.href)}
          label={t(item.key)}
          locale={locale}
          desktopOnly
        />
      ))}

      <span
        aria-disabled="true"
        data-design-status="provisional"
        className={`hidden h-full shrink-0 items-center text-[13px] font-normal whitespace-nowrap text-ink xl:flex ${favoritesWidths[locale]}`}
      >
        {t("favorites")}
      </span>

      <details
        ref={moreMenu}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.removeAttribute("open");
          }
        }}
        className="group relative flex h-full w-[15px] shrink-0 items-center xl:hidden"
      >
        <summary
          title={t("more")}
          className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 cursor-pointer list-none items-center justify-center text-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal aria-hidden size={17} strokeWidth={1.8} />
          <span className="sr-only">{t("more")}</span>
        </summary>
        <div className="absolute top-[58px] right-0 z-50 min-w-52 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
          {tabletOverflowItems.map(({ href, key, icon: Icon }) => {
            const active = isNavigationItemActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => moreMenu.current?.removeAttribute("open")}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active ? "bg-subtle text-brand-ink" : "text-ink hover:bg-page"
                }`}
              >
                <Icon aria-hidden size={18} strokeWidth={1.8} />
                {t(key)}
              </Link>
            );
          })}
          <span
            aria-disabled="true"
            data-design-status="provisional"
            className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted"
          >
            {t("favorites")}
          </span>
        </div>
      </details>
    </nav>
  );
}

function HeaderLink({
  item,
  active,
  label,
  locale,
  desktopOnly = false,
}: {
  item: NavigationItem;
  active: boolean;
  label: string;
  locale: AppLocale;
  desktopOnly?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative h-full shrink-0 items-center text-xs font-normal whitespace-nowrap text-ink transition-colors hover:text-brand-ink xl:text-[13px] ${item.headerWidths?.[locale] ?? ""} ${
        desktopOnly ? "hidden xl:flex" : "flex"
      }`}
    >
      {label}
    </Link>
  );
}

export function MobileMenuNavigation({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav aria-label={t("navigation")} className="grid gap-1">
      {mobileItems.map(({ href, key, icon: Icon }) => {
        const active = isNavigationItemActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active ? "bg-subtle text-brand-ink" : "text-ink hover:bg-page"
            }`}
          >
            <Icon aria-hidden size={19} strokeWidth={1.8} />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
