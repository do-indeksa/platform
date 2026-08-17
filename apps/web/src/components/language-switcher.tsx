"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { buildLocaleHref, buildLocalePathname } from "@/lib/locale-navigation";

const localeLabels: Record<AppLocale, string> = {
  sr: "SR",
  en: "EN",
  ru: "RU",
};

const languageOrder: readonly AppLocale[] = ["ru", "en", "sr"];
const fullSegmentWidths: Record<AppLocale, string> = {
  ru: "w-[43px]",
  en: "w-[42px]",
  sr: "w-[42px]",
};

function appLocale(value: string): AppLocale | null {
  switch (value) {
    case "sr":
      return "sr";
    case "en":
      return "en";
    case "ru":
      return "ru";
    default:
      return null;
  }
}

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
  const [currentHash, setCurrentHash] = useState<string | null>(null);

  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const localeHref = (nextLocale: AppLocale) =>
    buildLocaleHref(pathname, nextLocale, query, currentHash ?? "");

  const replaceLocale = (nextLocale: AppLocale) => {
    // Updating only pathname keeps search and hash while forcing a document navigation.
    window.location.pathname = buildLocalePathname(pathname, nextLocale);
  };

  if (compact) {
    return (
      <label className="relative flex h-[39px] w-[59px] items-start gap-0.5 rounded-xl bg-surface p-1 shadow-[inset_0_0_0_1px_var(--di-color-border-default)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <span className="flex h-[31px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-brand px-3 text-[13px] leading-normal font-medium text-on-brand">
          {localeLabels[locale]}
        </span>
        <span
          aria-hidden
          className="pointer-events-none w-[7px] shrink-0 text-[13px] leading-normal font-medium text-muted"
        >
          ⌄
        </span>
        <span className="sr-only">{t("language")}</span>
        <select
          aria-label={t("language")}
          value={locale}
          disabled={currentHash === null}
          onChange={(event) => {
            const nextLocale = appLocale(event.target.value);
            if (nextLocale) replaceLocale(nextLocale);
          }}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {languageOrder.map((item) => (
            <option key={item} value={item}>
              {localeLabels[item]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      aria-busy={currentHash === null ? true : undefined}
      className="flex h-[39px] w-[139px] items-start gap-0.5 rounded-xl bg-surface p-1 shadow-[inset_0_0_0_1px_var(--di-color-border-default)]"
    >
      {languageOrder.map((item) => {
        const active = item === locale;
        return (
          <a
            key={item}
            href={localeHref(item)}
            aria-disabled={currentHash === null ? true : undefined}
            aria-current={active ? "page" : undefined}
            tabIndex={currentHash === null ? -1 : undefined}
            className={`flex h-[31px] ${fullSegmentWidths[item]} shrink-0 items-center justify-center rounded-lg px-3 text-[13px] leading-normal font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${currentHash === null ? "pointer-events-none" : ""} ${
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
      className={`block h-[39px] animate-pulse rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--di-color-border-default)] ${
        compact ? "w-[59px]" : "w-[139px]"
      }`}
    />
  );
}
