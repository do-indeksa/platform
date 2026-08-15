"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TrainingBuilderPositionView } from "./types";

export function TrainingPositionRow({
  position,
  quantity,
  disabled,
  canIncrease,
  onQuantityChange,
}: {
  position: TrainingBuilderPositionView;
  quantity: number;
  disabled: boolean;
  canIncrease: boolean;
  onQuantityChange: (quantity: number) => void;
}) {
  const t = useTranslations("trainingBuilder");
  const selected = quantity > 0;

  return (
    <li
      data-testid={`training-position-${position.number}`}
      className="relative grid h-[98px] grid-cols-[44px_minmax(0,1fr)] gap-x-1 rounded-xl border border-line bg-surface px-3 pt-2.5 md:h-[62px] md:grid-cols-[32px_36px_minmax(0,1fr)_132px] md:items-center md:gap-x-3 md:rounded-none md:border-x-0 md:border-b-0 md:px-3.5 md:py-2.5"
    >
      <label
        className={`relative flex h-11 w-11 items-center justify-center md:h-8 md:w-8 ${
          !disabled && (selected || canIncrease)
            ? "cursor-pointer"
            : "cursor-not-allowed opacity-60"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled || (!selected && !canIncrease)}
          onChange={() => onQuantityChange(selected ? 0 : 1)}
          aria-label={t("selectPosition", { position: position.number })}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
            selected
              ? "border-brand bg-brand text-on-brand"
              : "border-line bg-surface text-transparent"
          }`}
        >
          <Check size={13} strokeWidth={2.4} />
        </span>
      </label>

      <div className="flex h-11 min-w-0 self-start items-center gap-2.5 overflow-hidden md:contents md:h-auto md:overflow-visible">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-subtle text-sm leading-5 font-semibold text-brand-ink tabular-nums md:h-9 md:w-9">
          {position.number}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span
            title={position.name}
            className="block truncate text-sm leading-5 font-semibold text-ink"
          >
            {position.name}
          </span>
          <span className="block truncate text-xs leading-4 font-medium tracking-[0.2px] text-muted">
            {t("positionDescription", { position: position.number })}
          </span>
        </span>
      </div>

      <div
        role="group"
        aria-label={t("quantity", { position: position.number })}
        className="absolute right-3 bottom-0 flex h-9 w-[132px] overflow-hidden rounded-[9px] border border-line bg-surface md:static md:col-start-auto md:mt-0 md:justify-self-end"
      >
        <button
          type="button"
          onClick={() => onQuantityChange(quantity - 1)}
          disabled={disabled || quantity === 0}
          aria-label={t("decrease", { position: position.number })}
          className="flex h-9 w-11 items-center justify-center text-muted transition-colors hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus aria-hidden size={14} strokeWidth={1.7} />
        </button>
        <output className="flex h-9 w-11 items-center justify-center text-sm leading-5 font-semibold text-ink tabular-nums">
          {quantity}
        </output>
        <button
          type="button"
          onClick={() => onQuantityChange(quantity + 1)}
          disabled={disabled || !canIncrease}
          aria-label={t("increase", { position: position.number })}
          className="flex h-9 w-11 items-center justify-center text-brand-ink transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus aria-hidden size={14} strokeWidth={1.7} />
        </button>
      </div>
    </li>
  );
}
