"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TrainingBuilderPositionView } from "./types";

export function TrainingSummary({
  positions,
  quantities,
  actualCounts,
  total,
  disabled,
  onRemove,
}: {
  positions: readonly TrainingBuilderPositionView[];
  quantities: Readonly<Record<number, number>>;
  actualCounts: Readonly<Record<number, number>>;
  total: number;
  disabled: boolean;
  onRemove: (position: TrainingBuilderPositionView) => void;
}) {
  const t = useTranslations("trainingBuilder");
  const selected = positions.filter(
    ({ number }) => (quantities[number] ?? 0) > 0,
  );

  return (
    <section
      aria-labelledby="training-summary-title"
      className="h-[300px] overflow-hidden rounded-[14px] border border-line bg-surface px-4 py-[18px]"
    >
      <h2
        id="training-summary-title"
        className="text-[22px] leading-[30px] font-semibold text-ink"
      >
        {t("summaryTitle")}
      </h2>
      <p className="mt-3 text-sm leading-5 text-muted">{t("subject")}</p>
      <p className="mt-2 inline-flex rounded-lg bg-subtle px-2.5 py-[7px] text-xs leading-4 font-medium tracking-[0.2px] text-brand-ink">
        {t("p1")}
      </p>
      <p className="mt-3 text-sm leading-5 text-muted">{t("composition")}</p>

      <ul className="mt-2 grid h-[108px] content-start gap-3 overflow-y-auto">
        {selected.length === 0 ? (
          <li className="flex min-h-12 items-center rounded-[9px] border border-line bg-page px-2.5 text-sm text-muted">
            {t("emptyComposition")}
          </li>
        ) : (
          selected.map((position) => (
            <li
              key={position.number}
              className="flex h-12 min-w-0 items-center gap-2.5 rounded-[9px] border border-line bg-page px-2.5"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-subtle text-xs leading-4 font-medium tracking-[0.2px] text-brand-ink tabular-nums">
                {position.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold text-ink">
                {position.name}
              </span>
              <span className="shrink-0 text-xs leading-4 font-medium tracking-[0.2px] text-muted">
                {t("taskCount", { count: actualCounts[position.number] ?? 0 })}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(position)}
                aria-label={t("removePosition", {
                  position: position.number,
                })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X aria-hidden size={14} strokeWidth={1.7} />
              </button>
            </li>
          ))
        )}
      </ul>

      <output data-testid="training-total" className="sr-only">
        {total}
      </output>
    </section>
  );
}
