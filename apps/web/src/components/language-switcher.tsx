"use client";

import { ChevronDown, Languages } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import { usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const localeLabels: Record<AppLocale, string> = {
  sr: "SR",
  en: "EN",
  ru: "RU",
};

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense fallback={<LanguageSwitcherFallback compact={compact} />}>
      <LanguageSwitcherContent compact={compact} />
    </Suspense>
  );
}

function LanguageSwitcherContent({ compact }: { compact: boolean }) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("nav");
  const query = searchParams.toString();

  const localeHref = (nextLocale: AppLocale) => {
    const suffix = pathname === "/" ? "" : pathname;
    const localizedPath =
      nextLocale === routing.defaultLocale
        ? pathname
        : `/${nextLocale}${suffix}`;
    return query ? `${localizedPath}?${query}` : localizedPath;
  };

  const replaceLocale = (nextLocale: AppLocale) => {
    // A document navigation avoids stale concurrent RSC responses on locale changes.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${localeHref(nextLocale)}${window.location.hash}`);
  };

  if (compact) {
    return (
      <label className="relative flex h-11 items-center rounded-lg border border-line bg-surface text-sm text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <Languages aria-hidden className="pointer-events-none ml-3" size={17} />
        <span className="sr-only">{t("language")}</span>
        <select
          aria-label={t("language")}
          value={locale}
          onChange={(event) => replaceLocale(event.target.value as AppLocale)}
          className="h-full cursor-pointer appearance-none bg-transparent pr-7 pl-2 font-semibold text-ink outline-none"
        >
          {routing.locales.map((item) => (
            <option key={item} value={item}>
              {localeLabels[item]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5"
          size={15}
          strokeWidth={1.8}
        />
      </label>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1"
    >
      {routing.locales.map((item) => {
        const active = item === locale;
        return (
          <a
            key={item}
            href={localeHref(item)}
            onClick={(event) => {
              event.preventDefault();
              replaceLocale(item);
            }}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? "bg-brand text-on-brand"
                : "text-muted hover:bg-page hover:text-ink"
            }`}
          >
            {localeLabels[item]}
          </a>
        );
      })}
    </div>
  );
}

function LanguageSwitcherFallback({ compact }: { compact: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-xl border border-line bg-surface ${
        compact ? "h-11 w-20" : "h-[54px] w-[142px]"
      }`}
    />
  );
}
