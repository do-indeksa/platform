"use client";

import { Info } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

export type PrepPlanViewMode = "positions" | "week" | "topics";

const modes: readonly PrepPlanViewMode[] = ["positions", "week", "topics"];

export function PrepPlanTabs({
  value,
  total,
  onChange,
}: {
  value: PrepPlanViewMode;
  total: number;
  onChange: (value: PrepPlanViewMode) => void;
}) {
  const t = useTranslations("prep");

  return (
    <div className="flex h-12 min-w-0 items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label={t("viewsLabel")}
        aria-orientation="horizontal"
        className="flex min-w-0 items-start gap-1"
      >
        {modes.map((mode, index) => (
          <button
            key={mode}
            id={`prep-plan-tab-${mode}`}
            type="button"
            role="tab"
            aria-selected={value === mode}
            aria-controls="prep-plan-panel"
            tabIndex={value === mode ? 0 : -1}
            onClick={() => onChange(mode)}
            onKeyDown={(event) =>
              moveTabFocus(event, index, (next) => onChange(modes[next]))
            }
            className={`min-h-9 rounded-[9px] px-2.5 text-xs leading-4 font-medium whitespace-nowrap transition-colors sm:px-[18px] ${
              value === mode
                ? "bg-subtle text-brand-ink"
                : "text-ink hover:bg-surface"
            }`}
          >
            {t(`view.${mode}`)}
          </button>
        ))}
      </div>

      <details className="group relative hidden shrink-0 sm:block">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm leading-5 text-brand-ink focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
          {t("methodLink")}
          <Info aria-hidden className="ml-2 h-3.5 w-3.5" strokeWidth={1.8} />
        </summary>
        <p className="absolute top-11 right-0 z-20 w-80 rounded-lg border border-line bg-surface p-4 text-xs leading-5 text-muted shadow-lg">
          {t("readinessMethod", { total })}
        </p>
      </details>
    </div>
  );
}

function moveTabFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  select: (index: number) => void,
) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % modes.length;
  else if (event.key === "ArrowLeft") {
    next = (index - 1 + modes.length) % modes.length;
  } else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = modes.length - 1;
  else return;

  event.preventDefault();
  select(next);
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    .item(next)
    .focus();
}
