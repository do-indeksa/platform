"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import {
  isSimulationBlueprintVersion,
  isSimulationRunId,
  simulationRunHref,
} from "@/lib/simulation-run";
import type { SimulationArchiveRun } from "@/lib/simulation-archive";
import { HistoryEmpty } from "./history-empty";

export function VariantHistoryList({
  entries,
}: {
  entries: SimulationArchiveRun[];
}) {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;

  if (entries.length === 0) return <HistoryEmpty kind="variants" />;

  const dateFormatter = new Intl.DateTimeFormat(htmlLanguage(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-muted">
            <tr>
              <th className="w-[27%] px-3 py-3 pl-0">{t("variantColumn")}</th>
              <th className="w-[23%] px-3 py-3">{t("dateColumn")}</th>
              <th className="w-[16%] px-3 py-3">{t("scoreColumn")}</th>
              <th className="w-[16%] px-3 py-3">{t("timeColumn")}</th>
              <th className="w-[10%] px-3 py-3">{t("statusColumn")}</th>
              <th className="w-[8%] px-3 py-3 pr-0 text-right">
                <span className="sr-only">{t("actionColumn")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <VariantTableRow
                key={entry.id}
                entry={entry}
                date={dateFormatter.format(new Date(entry.finishedAt))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line border-y border-line md:hidden">
        {entries.map((entry) => (
          <VariantMobileRow
            key={entry.id}
            entry={entry}
            date={dateFormatter.format(new Date(entry.finishedAt))}
          />
        ))}
      </ul>
    </>
  );
}

function VariantTableRow({
  entry,
  date,
}: {
  entry: SimulationArchiveRun;
  date: string;
}) {
  const t = useTranslations("history");
  const href = resultHref(entry);
  return (
    <tr>
      <td className="px-3 py-5 pl-0 font-semibold">
        {t("variantName")}
        <span className="mt-1 block font-mono text-xs font-normal text-muted">
          {entry.blueprintVersion}
        </span>
      </td>
      <td className="px-3 py-5 text-muted">{date}</td>
      <td className="px-3 py-5 font-mono font-semibold tabular-nums">
        {scoreLabel(entry, t)}
      </td>
      <td className="px-3 py-5 text-muted">
        {durationLabel(entry.durationMs, t)}
      </td>
      <td className="px-3 py-5 text-muted">{completionLabel(entry, t)}</td>
      <td className="px-3 py-5 pr-0 text-right">
        {href ? (
          <Link
            href={href}
            aria-label={t("openVariantAttempt")}
            className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand-ink hover:text-brand"
          >
            {t("open")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-xs text-muted">{t("unavailable")}</span>
        )}
      </td>
    </tr>
  );
}

function VariantMobileRow({
  entry,
  date,
}: {
  entry: SimulationArchiveRun;
  date: string;
}) {
  const t = useTranslations("history");
  const href = resultHref(entry);
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{t("variantName")}</p>
          <p className="mt-1 text-xs text-muted">{date}</p>
        </div>
        <p className="font-mono font-semibold tabular-nums">
          {scoreLabel(entry, t)}
        </p>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 text-sm text-muted">
        <p>
          {durationLabel(entry.durationMs, t)} · {completionLabel(entry, t)}
        </p>
        {href && <ArrowRight aria-hidden className="h-4 w-4 text-brand" />}
      </div>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          aria-label={t("openVariantAttempt")}
          className="block py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {content}
        </Link>
      ) : (
        <div className="py-5">{content}</div>
      )}
    </li>
  );
}

function resultHref(entry: SimulationArchiveRun): string | null {
  if (
    entry.historyEntry === null ||
    !isSimulationRunId(entry.id) ||
    !isSimulationBlueprintVersion(entry.blueprintVersion)
  ) {
    return null;
  }
  return simulationRunHref("/simulation/result", {
    runId: entry.id,
    blueprintVersion: entry.blueprintVersion,
    taskIds: entry.taskIds,
  });
}

function durationLabel(
  durationMs: number,
  t: ReturnType<typeof useTranslations<"history">>,
): string {
  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? t("durationHoursMinutes", { hours, minutes })
    : t("durationMinutes", { minutes: totalMinutes });
}

function completionLabel(
  entry: SimulationArchiveRun,
  t: ReturnType<typeof useTranslations<"history">>,
): string {
  if (entry.score === null) return t("awaitingReview");
  if (entry.timedOut) return t("timedOut");
  if (entry.answeredCount < entry.taskIds.length) {
    return t("partial", {
      answered: entry.answeredCount,
      total: entry.taskIds.length,
    });
  }
  return t("complete");
}

function scoreLabel(
  entry: SimulationArchiveRun,
  t: ReturnType<typeof useTranslations<"history">>,
): string {
  return entry.score === null
    ? t("scorePending", { max: entry.maxPoints })
    : t("scoreValue", { score: entry.score, max: entry.maxPoints });
}
