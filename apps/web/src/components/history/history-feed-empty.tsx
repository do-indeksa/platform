"use client";

import { KeyRound, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function HistoryFeedEmpty({
  filtered,
  onReset,
}: {
  filtered: boolean;
  onReset: () => void;
}) {
  const t = useTranslations("history.feed.empty");
  return (
    <section className="flex min-h-[370px] flex-col items-center justify-center px-4 pb-8 text-center md:min-h-[470px]">
      <KeyRound
        aria-hidden
        size={58}
        strokeWidth={1.8}
        className="text-brand"
      />
      <h2 className="mt-5 text-[22px] leading-[30px] font-semibold text-ink">
        {t(filtered ? "filteredTitle" : "title")}
      </h2>
      <p className="mt-3 max-w-[590px] text-sm leading-5 text-muted">
        {t(filtered ? "filteredDescription" : "description")}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-5 inline-flex h-[46px] items-center justify-center gap-2 rounded-[9px] bg-subtle px-8 text-sm font-medium text-brand-ink"
        >
          <RotateCcw aria-hidden size={16} strokeWidth={1.8} />
          {t("reset")}
        </button>
      ) : (
        <Link
          href="/tasks"
          className="mt-5 inline-flex h-[46px] items-center justify-center rounded-[9px] bg-subtle px-8 text-sm font-medium text-brand-ink"
        >
          {t("tasks")}
        </Link>
      )}
    </section>
  );
}
