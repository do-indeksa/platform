"use client";

import { Check, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { TaskSummary } from "@/lib/content";
import type { TaskProgress } from "@/lib/task-bank";

export function TaskRow({
  task,
  topicLabel,
  selected,
  progress,
  href,
  onOpen,
  onSelect,
}: {
  task: TaskSummary;
  topicLabel: string;
  selected: boolean;
  progress: TaskProgress | null;
  href: string;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const t = useTranslations("taskBank");

  return (
    <li
      className={`grid h-[88px] grid-cols-[auto_minmax(0,1fr)_18px] items-center gap-2.5 rounded-xl border bg-surface px-[11px] md:h-[72px] md:grid-cols-[auto_minmax(0,1fr)_auto_18px] md:gap-3.5 md:px-[15px] ${
        selected ? "border-brand" : "border-line"
      }`}
    >
      <label
        className={`relative flex shrink-0 cursor-pointer items-center ${
          selected ? "gap-2.5 md:gap-3.5" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={t("selectTask", { id: task.id })}
          className="absolute -inset-1 z-10 cursor-pointer opacity-0"
        />
        {selected && (
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-brand text-on-brand"
          >
            <Check size={13} strokeWidth={2.4} />
          </span>
        )}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-sm leading-5 font-semibold text-brand-ink tabular-nums">
          {task.slot}
        </span>
      </label>

      <Link
        href={href}
        prefetch={false}
        onClick={onOpen}
        className="group flex h-16 min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-12"
      >
        <div
          className="line-clamp-2 text-sm leading-5 font-semibold text-ink group-hover:text-brand-ink md:line-clamp-1 [&_.katex]:text-[0.94em] [&_.katex-display]:m-0 [&_.katex-display]:inline-block [&_br]:hidden [&_img]:hidden [&_p]:inline"
          dangerouslySetInnerHTML={{ __html: task.statementPreviewHtml }}
        />
        <div className="flex min-w-0 items-center gap-1 text-xs leading-4 font-medium text-muted">
          <span className="shrink-0">{t("mathematics")}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{topicLabel}</span>
        </div>
      </Link>

      <span className="hidden text-xs leading-4 font-medium text-muted md:block">
        {t(`difficultyShort.${difficultyName(task.difficulty)}`)}
      </span>

      <button
        type="button"
        disabled
        aria-label={t("favoriteTask")}
        data-design-status="provisional"
        className="relative flex h-11 w-[18px] items-center justify-center text-muted"
      >
        <Star aria-hidden size={16} strokeWidth={1.4} className="text-muted" />
      </button>
      {progress !== null && (
        <span className="sr-only">{t(`progress.${progress}`)}</span>
      )}
    </li>
  );
}

function difficultyName(difficulty: number): "easy" | "medium" | "hard" {
  if (difficulty <= 2) return "easy";
  if (difficulty === 3) return "medium";
  return "hard";
}
