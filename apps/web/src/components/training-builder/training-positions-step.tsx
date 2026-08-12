"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { TRAINING_BUILDER_MAX_TASKS } from "@/lib/training-builder";
import { TrainingPositionRow } from "./training-position-row";
import { TrainingStepHeading } from "./training-step-heading";
import type { TrainingBuilderPositionView } from "./types";

export type TrainingBuilderPreset = "all" | "new" | "mistakes";

export function TrainingPositionsStep({
  positions,
  quantities,
  selectedTotal,
  showAllPositions,
  journalReady,
  onPresetSelect,
  onReset,
  onShowAllPositionsChange,
  onQuantityChange,
}: {
  positions: readonly TrainingBuilderPositionView[];
  quantities: Readonly<Record<number, number>>;
  selectedTotal: number;
  showAllPositions: boolean;
  journalReady: boolean;
  onPresetSelect: (preset: TrainingBuilderPreset) => void;
  onReset: () => void;
  onShowAllPositionsChange: (showAll: boolean) => void;
  onQuantityChange: (
    position: TrainingBuilderPositionView,
    quantity: number,
  ) => void;
}) {
  const t = useTranslations("trainingBuilder");
  const visiblePositions = showAllPositions ? positions : positions.slice(0, 8);

  return (
    <section
      aria-labelledby="training-positions-title"
      className={`overflow-hidden rounded-[14px] border border-line bg-surface p-4 transition-[height] ${
        showAllPositions
          ? "h-[1176px] md:h-[800px] xl:h-[746px]"
          : "h-[980px] md:h-[676px] xl:h-[622px]"
      }`}
    >
      <TrainingStepHeading id="training-positions-title" step={2}>
        {t("positionsStep")}
      </TrainingStepHeading>

      <div className="mt-3 grid grid-cols-2 gap-x-2 md:grid-cols-4 md:gap-2 xl:flex xl:h-11 xl:[&>button:nth-child(1)]:w-[160px] xl:[&>button:nth-child(2)]:w-[150px] xl:[&>button:nth-child(3)]:w-[200px] xl:[&>button:nth-child(4)]:w-[120px]">
        <PresetButton onClick={() => onPresetSelect("all")}>
          {t("presets.all")}
        </PresetButton>
        <PresetButton
          disabled={!journalReady}
          onClick={() => onPresetSelect("new")}
        >
          {t("presets.new")}
        </PresetButton>
        <PresetButton
          disabled={!journalReady}
          onClick={() => onPresetSelect("mistakes")}
        >
          {t("presets.mistakes")}
        </PresetButton>
        <PresetButton onClick={onReset}>
          <RotateCcw aria-hidden size={14} strokeWidth={1.7} />
          {t("reset")}
        </PresetButton>
      </div>

      <ul className="mt-3 grid overflow-hidden rounded-xl border-x border-b border-line md:rounded-none xl:mt-3">
        {visiblePositions.map((position) => {
          const quantity = quantities[position.number] ?? 0;
          return (
            <TrainingPositionRow
              key={position.number}
              position={position}
              quantity={quantity}
              canIncrease={
                selectedTotal < TRAINING_BUILDER_MAX_TASKS &&
                quantity < position.availableCount
              }
              onQuantityChange={(nextQuantity) =>
                onQuantityChange(position, nextQuantity)
              }
            />
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onShowAllPositionsChange(!showAllPositions)}
        aria-expanded={showAllPositions}
        className="mt-3 flex h-[42px] min-w-40 items-center justify-center rounded-[10px] border border-line bg-surface px-3 text-sm leading-5 font-semibold text-ink hover:border-brand"
      >
        {showAllPositions ? t("showLess") : t("showMore")}
      </button>
    </section>
  );
}

function PresetButton({
  disabled = false,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-[10px] border border-line bg-surface px-2 text-sm leading-5 font-semibold whitespace-nowrap text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-50 xl:shrink-0 xl:px-3"
    >
      {children}
    </button>
  );
}
