"use client";

import { useLocale, useTranslations } from "next-intl";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { useSimulation } from "@/lib/simulation-store";
import { useHydrated } from "@/lib/use-hydrated";

export function SimulationHistory() {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const history = useSimulation((state) => state.history);
  const hydrated = useHydrated();

  if (!hydrated || history.length === 0) return null;

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="mb-3 text-xl font-bold">{t("historyTitle")}</h2>
      <ul className="divide-y divide-line border-y border-line">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
          >
            <time dateTime={new Date(entry.finishedAt).toISOString()}>
              {new Date(entry.finishedAt).toLocaleDateString(
                htmlLanguage(locale as AppLocale),
                {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </time>
            <span className="font-mono font-medium">
              {t("estimateHistory", {
                score: entry.score,
                max: entry.maxPoints,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
