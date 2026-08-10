"use client";

import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SelectionBar({
  count,
  href,
  onClear,
  onStart,
}: {
  count: number;
  href: string;
  onClear: () => void;
  onStart: () => void;
}) {
  const t = useTranslations("taskBank");
  return (
    <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-lg bg-emphasis p-3 text-white shadow-xl md:bottom-6 md:px-4">
      <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums">
        {t("selectedCount", { count })}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-label={t("clearSelection")}
        title={t("clearSelection")}
      >
        <X aria-hidden size={19} />
      </button>
      <Link
        href={href}
        onClick={onStart}
        className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span className="hidden sm:inline">{t("startPractice")}</span>
        <span className="sm:hidden">{t("start")}</span>
        <ArrowRight aria-hidden size={17} />
      </Link>
    </div>
  );
}
