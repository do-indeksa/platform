import { defineRouting } from "next-intl/routing";

export const locales = ["sr", "en", "ru"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "sr";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeDetection: false,
});

const htmlLanguages: Record<AppLocale, string> = {
  sr: "sr-Latn",
  en: "en",
  ru: "ru",
};

export function htmlLanguage(locale: AppLocale): string {
  return htmlLanguages[locale];
}
