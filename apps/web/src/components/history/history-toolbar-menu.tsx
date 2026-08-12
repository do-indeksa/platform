"use client";

import { BarChart3, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Link } from "@/i18n/navigation";

export function HistoryToolbarMenu({
  canReset,
  practiceHref,
  showTrend,
  syncStatus,
  onReset,
  onShowTrend,
}: {
  canReset: boolean;
  practiceHref: string | null;
  showTrend: boolean;
  syncStatus: "guest" | "synced" | "degraded";
  onReset: () => void;
  onShowTrend: () => void;
}) {
  const t = useTranslations("history.feed.actions");
  const menu = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={menu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.removeAttribute("open");
        }
      }}
      className="relative h-full w-full"
    >
      <summary
        role="button"
        aria-label={t("label")}
        title={t("label")}
        className={`flex h-full w-full cursor-pointer list-none items-center justify-center rounded-[9px] border bg-surface outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15 [&::-webkit-details-marker]:hidden ${
          syncStatus === "degraded"
            ? "border-amber-400 text-amber-700"
            : "border-line text-ink"
        }`}
      >
        <SlidersHorizontal aria-hidden size={15} strokeWidth={1.7} />
      </summary>
      <div className="absolute top-[calc(100%+6px)] right-0 z-30 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
        <button
          type="button"
          disabled={!canReset}
          onClick={() => {
            onReset();
            menu.current?.removeAttribute("open");
          }}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-ink hover:bg-page disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
        >
          <RotateCcw aria-hidden size={16} strokeWidth={1.8} />
          {t("reset")}
        </button>
        {showTrend && (
          <button
            type="button"
            onClick={() => {
              onShowTrend();
              menu.current?.removeAttribute("open");
            }}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-ink hover:bg-page"
          >
            <BarChart3 aria-hidden size={16} strokeWidth={1.8} />
            {t("trend")}
          </button>
        )}
        {practiceHref && (
          <Link
            href={practiceHref}
            onClick={() => menu.current?.removeAttribute("open")}
            className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm text-ink hover:bg-page"
          >
            <RotateCcw aria-hidden size={16} strokeWidth={1.8} />
            {t("retry")}
          </Link>
        )}
        <p className="border-t border-line px-3 pt-2 pb-1 text-xs leading-4 text-muted">
          {t(`sync.${syncStatus}`)}
        </p>
      </div>
    </details>
  );
}
