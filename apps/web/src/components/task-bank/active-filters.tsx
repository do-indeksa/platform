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
    <div className="flex h-7 min-w-0 items-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-subtle pr-2 pl-2.5 text-xs leading-4 font-medium text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          {chip.label}
          <X aria-hidden size={11} strokeWidth={1.8} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...defaultTaskBankFilters })}
        className="hidden h-4 shrink-0 items-center px-0.5 text-xs leading-4 font-medium text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand md:flex"
      >
        {t("resetAll")}
      </button>
    </div>
  );
}
