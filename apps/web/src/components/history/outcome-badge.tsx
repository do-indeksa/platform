import { useTranslations } from "next-intl";
import type { HistoryAttemptOutcome } from "@/lib/history-journal";

const tone: Record<HistoryAttemptOutcome, string> = {
  correct: "bg-emerald-50 text-emerald-800",
  incorrect: "bg-red-50 text-red-800",
  partial: "bg-amber-50 text-amber-800",
  skipped: "bg-zinc-100 text-zinc-600",
  ungraded: "bg-sky-50 text-sky-800",
};

export function OutcomeBadge({ outcome }: { outcome: HistoryAttemptOutcome }) {
  const t = useTranslations("history");
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tone[outcome]}`}
    >
      {t(`outcome.${outcome}`)}
    </span>
  );
}
