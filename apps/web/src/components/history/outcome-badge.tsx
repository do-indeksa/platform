import { useTranslations } from "next-intl";
import type { TaskHistoryOutcome } from "@/lib/task-history";

const tone: Record<TaskHistoryOutcome, string> = {
  correct: "bg-emerald-50 text-emerald-800",
  incorrect: "bg-red-50 text-red-800",
  skipped: "bg-zinc-100 text-zinc-600",
};

export function OutcomeBadge({ outcome }: { outcome: TaskHistoryOutcome }) {
  const t = useTranslations("history");
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tone[outcome]}`}
    >
      {t(`outcome.${outcome}`)}
    </span>
  );
}
