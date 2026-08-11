"use client";

import { useLocale, useTranslations } from "next-intl";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import type { SimulationArchiveRun } from "@/lib/simulation-archive";
import {
  buildSimulationScoreTrend,
  type SimulationScoreTrendPoint,
} from "@/lib/simulation-score-trend";

export function VariantScoreTrend({
  entries,
}: {
  entries: readonly SimulationArchiveRun[];
}) {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;
  const trend = buildSimulationScoreTrend(entries);
  if (trend === null) return null;

  const dateFormatter = new Intl.DateTimeFormat(htmlLanguage(locale), {
    dateStyle: "medium",
  });
  const first = trend.points[0];
  const latest = trend.points.at(-1);
  if (first === undefined || latest === undefined) return null;
  const delta = deltaMetric(trend.delta, t);

  return (
    <section
      data-testid="variant-score-trend"
      aria-labelledby="variant-score-trend-title"
      className="mb-8 border-b border-line pt-2 pb-8"
    >
      <div className="max-w-3xl">
        <h2 id="variant-score-trend-title" className="text-xl font-bold">
          {t("trendTitle")}
        </h2>
        <p
          id="variant-score-trend-description"
          className="mt-2 text-sm leading-6 text-muted"
        >
          {t("trendDescription")}
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line">
        <TrendMetric
          label={t("trendLatest")}
          value={t("scoreValue", {
            score: trend.latest,
            max: trend.maxPoints,
          })}
        />
        <TrendMetric
          label={t("trendBest")}
          value={t("scoreValue", {
            score: trend.best,
            max: trend.maxPoints,
          })}
        />
        <TrendMetric
          label={t("trendChange")}
          value={delta.value}
          accessibleValue={delta.label}
        />
      </dl>

      <div
        role="img"
        aria-labelledby="variant-score-trend-title variant-score-trend-description"
        className="mt-6"
      >
        <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
          <div
            aria-hidden
            className="flex h-40 flex-col justify-between text-right font-mono text-[11px] leading-none text-muted"
          >
            <span>{trend.maxPoints}</span>
            <span>{trend.maxPoints / 2}</span>
            <span>0</span>
          </div>
          <div>
            <div className="relative h-40 border-b border-line">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 border-t border-dashed border-line"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 top-1/2 border-t border-dashed border-line"
              />
              <div
                aria-hidden
                className="relative grid h-full items-end gap-1.5 px-1 sm:gap-2"
                style={{
                  gridTemplateColumns: `repeat(${trend.points.length}, minmax(0, 1fr))`,
                }}
              >
                {trend.points.map((point) => (
                  <div
                    key={point.id}
                    className="flex h-full items-end justify-center"
                  >
                    <span
                      data-testid="variant-score-trend-bar"
                      title={t("trendPoint", {
                        date: dateFormatter.format(new Date(point.finishedAt)),
                        score: point.score,
                        max: trend.maxPoints,
                      })}
                      className={`w-full max-w-8 rounded-t-sm ${barTone(
                        point,
                        latest,
                        trend.best,
                      )}`}
                      style={{
                        height:
                          point.score === 0
                            ? "2px"
                            : `${(point.score / trend.maxPoints) * 100}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between gap-4 text-xs text-muted">
              <time dateTime={new Date(first.finishedAt).toISOString()}>
                {dateFormatter.format(new Date(first.finishedAt))}
              </time>
              {first.id !== latest.id && (
                <time
                  dateTime={new Date(latest.finishedAt).toISOString()}
                  className="text-right"
                >
                  {dateFormatter.format(new Date(latest.finishedAt))}
                </time>
              )}
            </div>
          </div>
        </div>
      </div>

      <ol className="sr-only">
        {trend.points.map((point) => (
          <li key={point.id}>
            {t("trendPoint", {
              date: dateFormatter.format(new Date(point.finishedAt)),
              score: point.score,
              max: trend.maxPoints,
            })}
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrendMetric({
  label,
  value,
  accessibleValue,
}: {
  label: string;
  value: string;
  accessibleValue?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-4 first:pl-0 last:pr-0 sm:px-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        aria-label={accessibleValue}
        className="mt-1 text-xl font-bold tabular-nums sm:text-2xl"
      >
        {value}
      </dd>
    </div>
  );
}

function deltaMetric(
  delta: number | null,
  t: ReturnType<typeof useTranslations<"history">>,
): { value: string; label: string } {
  if (delta === null) {
    return { value: "-", label: t("trendFirstResult") };
  }
  if (delta > 0) {
    return {
      value: `+${delta}`,
      label: t("trendDeltaUp", { points: delta }),
    };
  }
  if (delta < 0) {
    return {
      value: String(delta),
      label: t("trendDeltaDown", { points: Math.abs(delta) }),
    };
  }
  return { value: "0", label: t("trendDeltaSame") };
}

function barTone(
  point: SimulationScoreTrendPoint,
  latest: SimulationScoreTrendPoint,
  best: number,
): string {
  if (point.id === latest.id) return "bg-brand";
  if (point.score === best) return "bg-emerald-500";
  return "bg-zinc-300";
}
