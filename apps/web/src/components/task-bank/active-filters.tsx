"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { defaultTaskBankFilters, type TaskBankFilters } from "@/lib/task-bank";

export function ActiveFilters({
  filters,
  topicLabels,
  onChange,
}: {
  filters: TaskBankFilters;
  topicLabels: Record<string, string>;
  onChange: (filters: TaskBankFilters) => void;
}) {
  const t = useTranslations("taskBank");
  const chips = [
    ...filters.positions.map((position) => ({
      key: `position-${position}`,
      label: t("positionChip", { position }),
      remove: () =>
        onChange({
          ...filters,
          positions: filters.positions.filter((value) => value !== position),
        }),
    })),
    ...filters.topics.map((topic) => ({
      key: `topic-${topic}`,
      label: topicLabels[topic],
      remove: () =>
        onChange({
          ...filters,
          topics: filters.topics.filter((value) => value !== topic),
        }),
    })),
    ...filters.difficulties.map((difficulty) => ({
      key: `difficulty-${difficulty}`,
      label: t(`difficulty.${difficulty}`),
      remove: () =>
        onChange({
          ...filters,
          difficulties: filters.difficulties.filter(
            (value) => value !== difficulty,
          ),
        }),
    })),
    ...(filters.progress === "all"
      ? []
      : [
          {
            key: `progress-${filters.progress}`,
            label: t(`progress.${filters.progress}`),
            remove: () => onChange({ ...filters, progress: "all" }),
          },
        ]),
  ];

  if (chips.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="flex min-h-8 items-center gap-1.5 rounded-full bg-subtle px-3 text-xs font-semibold text-brand-ink transition-colors hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {chip.label}
          <X aria-hidden size={13} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...defaultTaskBankFilters })}
        className="min-h-8 px-2 text-xs font-semibold text-muted hover:text-ink hover:underline"
      >
        {t("reset")}
      </button>
    </div>
  );
}
