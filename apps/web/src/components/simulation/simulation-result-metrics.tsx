"use client";

import { CircleCheck, Clock3, Gauge, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  formatExamDuration,
  type SimulationResultSummary,
} from "@/lib/simulation-result";

export function ResultMetrics({
  summary,
}: {
  summary: SimulationResultSummary;
}) {
  const t = useTranslations("simulation");
  const delta =
    summary.delta === null
      ? "—"
      : `${summary.delta > 0 ? "+" : ""}${summary.delta}`;
  const deltaDetail = !summary.complete
    ? t("deltaPartial")
    : summary.delta === null
      ? t("deltaFirst")
      : t("deltaPrevious");

  return (
    <dl className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        icon={Gauge}
        label={t("scoreMetric")}
        value={`${summary.score} / ${summary.maxPoints}`}
        detail={t(
          summary.rubricAssessedCount > 0 ? "rubricEstimate" : "binaryEstimate",
        )}
      />
      <Metric
        icon={CircleCheck}
        label={t("correctMetric")}
        value={`${summary.correctCount} / ${summary.totalCount}`}
        detail={t("answeredDetail", {
          answered: summary.answeredCount,
          total: summary.totalCount,
        })}
      />
      <Metric
        icon={Clock3}
        label={t("timeMetric")}
        value={formatExamDuration(summary.durationMs)}
        detail={t("hoursMinutes")}
      />
      <Metric
        icon={TrendingUp}
        label={t("deltaMetric")}
        value={delta}
        detail={deltaDetail}
      />
    </dl>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 py-5 sm:px-5 sm:first:pl-0 lg:border-r lg:border-line lg:last:border-r-0">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        <Icon aria-hidden className="h-4 w-4 text-brand" />
        <dt>{label}</dt>
      </div>
      <dd className="mt-3 text-3xl font-bold tabular-nums">{value}</dd>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}
