"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import { mergeSimulationArchive } from "@/lib/simulation-archive";
import { useSimulationArchive } from "@/lib/simulation-archive-store";
import { useSimulationHistory } from "@/lib/simulation-store";
import { useHydrated } from "@/lib/use-hydrated";

export function SimulationHistory() {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const localHistory = useSimulationHistory();
  const archive = useSimulationArchive();
  const hydrated = useHydrated();
  const history =
    archive && localHistory
      ? mergeSimulationArchive(localHistory, archive.entries)
      : [];

  if (
    !hydrated ||
    archive === null ||
    localHistory === null ||
    history.length === 0
  ) {
    return null;
  }

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
              {entry.score === null
                ? t("estimateHistoryPending", { max: entry.maxPoints })
                : t("estimateHistory", {
                    score: entry.score,
                    max: entry.maxPoints,
                  })}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/history?tab=variants"
        className="mt-4 inline-flex min-h-10 items-center font-semibold text-brand-ink hover:text-brand"
      >
        {t("viewHistory")}
        <ArrowRight aria-hidden className="ml-1.5 h-4 w-4" />
      </Link>
    </section>
  );
}
