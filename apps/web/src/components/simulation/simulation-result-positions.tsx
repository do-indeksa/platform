"use client";

import {
  AlertCircle,
  CircleCheck,
  CircleDashed,
  CircleDotDashed,
} from "lucide-react";
import { useTranslations } from "next-intl";

export function ResultPositions({
  strong,
  partial,
  weak,
  unanswered,
}: {
  strong: number[];
  partial: number[];
  weak: number[];
  unanswered: number[];
}) {
  const t = useTranslations("simulation");
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <PositionPanel
        icon={CircleCheck}
        title={t("strongPositions")}
        positions={strong}
        empty={t("noStrongPositions")}
        tone="green"
      />
      <PositionPanel
        icon={CircleDotDashed}
        title={t("partialPositions")}
        positions={partial}
        empty={t("noPartialPositions")}
        tone="amber"
      />
      <PositionPanel
        icon={AlertCircle}
        title={t("weakPositions")}
        positions={weak}
        empty={t("noWeakPositions")}
        tone="red"
      />
      <PositionPanel
        icon={CircleDashed}
        title={t("unansweredPositions")}
        positions={unanswered}
        empty={t("noUnansweredPositions")}
        tone="neutral"
      />
    </section>
  );
}

function PositionPanel({
  icon: Icon,
  title,
  positions,
  empty,
  tone,
}: {
  icon: typeof CircleCheck;
  title: string;
  positions: number[];
  empty: string;
  tone: "green" | "red" | "amber" | "neutral";
}) {
  const styles = {
    green: "bg-emerald-50 text-emerald-900",
    red: "bg-red-50 text-red-900",
    amber: "bg-amber-50 text-amber-950",
    neutral: "bg-zinc-100 text-zinc-800",
  }[tone];
  return (
    <div className={`rounded-lg p-5 ${styles}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden className="h-5 w-5" />
        <h2>{title}</h2>
      </div>
      {positions.length > 0 ? (
        <p className="mt-5 text-xl font-bold tabular-nums">
          {positions.join(", ")}
        </p>
      ) : (
        <p className="mt-5 text-sm leading-6 opacity-80">{empty}</p>
      )}
    </div>
  );
}
