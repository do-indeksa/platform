"use client";

import { Delete } from "lucide-react";
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
    <div className="sticky top-[74px] z-20 flex h-10 min-w-0 items-center gap-2 bg-page text-xs leading-4 text-ink md:top-[76px] xl:top-[84px]">
      <p className="mr-1 w-[71px] shrink-0 font-normal tabular-nums">
        {t("selectionCount", { count })}
      </p>
      <span
        aria-disabled="true"
        data-design-status="provisional"
        className="hidden h-10 w-[132px] shrink-0 items-center justify-center rounded-[9px] bg-brand px-2 font-medium text-on-brand min-[375px]:flex"
      >
        {t("addToSet")}
      </span>
      <Link
        href={href}
        onClick={onStart}
        aria-label={t("startPractice")}
        className="flex h-10 w-[82px] shrink-0 items-center justify-center rounded-[9px] bg-brand px-2 font-medium text-on-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
      >
        {t("solveSelected")}
      </Link>
      <button
        type="button"
        onClick={onClear}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-line bg-surface text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        aria-label={t("clearSelection")}
        title={t("clearSelection")}
      >
        <Delete aria-hidden size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}
