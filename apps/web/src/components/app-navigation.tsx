"use client";

import {
  BookOpenCheck,
  Calculator,
  ClipboardList,
  History,
  LayoutDashboard,
  Map,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isNavigationItemActive } from "@/lib/app-routes";

type NavigationItem = {
  href: string;
  key: "overview" | "prep" | "tasks" | "simulation" | "history" | "calculator";
  icon: LucideIcon;
};

const primaryItems: NavigationItem[] = [
  { href: "/", key: "overview", icon: LayoutDashboard },
  { href: "/tasks", key: "tasks", icon: ClipboardList },
  { href: "/prep", key: "prep", icon: Map },
  { href: "/simulation", key: "simulation", icon: BookOpenCheck },
];

const historyItem: NavigationItem = {
  href: "/history",
  key: "history",
  icon: History,
};

const secondaryItems: NavigationItem[] = [
  historyItem,
  { href: "/calculator", key: "calculator", icon: Calculator },
];

const allItems = [...primaryItems, ...secondaryItems];
const mobileItems = primaryItems;

export function DesktopNavigation() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const secondaryActive = secondaryItems.some(({ href }) =>
    isNavigationItemActive(pathname, href),
  );

  return (
    <nav
      data-testid="desktop-navigation"
      aria-label={t("navigation")}
      className="hidden h-16 min-w-0 items-stretch md:flex"
    >
      {primaryItems.map((item) => (
        <HeaderLink
          key={item.href}
          item={item}
          active={isNavigationItemActive(pathname, item.href)}
          label={t(item.key)}
        />
      ))}
      <details
        ref={moreMenu}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.removeAttribute("open");
          }
        }}
        className="group relative flex h-16 items-center"
      >
        <summary
          className={`flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden ${
            secondaryActive
              ? "bg-subtle text-brand-ink"
              : "text-muted hover:bg-subtle hover:text-ink"
          }`}
          title={t("more")}
        >
          <MoreHorizontal aria-hidden size={20} strokeWidth={1.8} />
          <span className="sr-only">{t("more")}</span>
        </summary>
        <div className="absolute top-[58px] right-0 z-50 min-w-48 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
          {secondaryItems.map(({ href, key, icon: Icon }) => {
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
        </div>
      </details>
    </nav>
  );
}

function HeaderLink({
  item,
  active,
  label,
}: {
  item: NavigationItem;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-0 items-center px-2.5 text-xs font-medium whitespace-nowrap transition-colors lg:px-3.5 lg:text-[13px] ${
        active ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {label}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-brand lg:inset-x-3.5"
        />
      )}
    </Link>
  );
}

export function MobileBottomNavigation() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      data-testid="mobile-navigation"
      aria-label={t("navigation")}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {mobileItems.map(({ href, key, icon: Icon }) => {
        const active = isNavigationItemActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand ${
              active ? "text-brand-ink" : "text-muted"
            }`}
          >
            <Icon aria-hidden size={20} strokeWidth={active ? 2.2 : 1.7} />
            <span className="line-clamp-2 max-w-full text-center leading-[13px]">
              {t(key)}
            </span>
          </Link>
        );
      })}
    </nav>
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
      {allItems.map(({ href, key, icon: Icon }) => {
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
