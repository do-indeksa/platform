"use client";

import { CheckCircle2, Circle, CircleX } from "lucide-react";
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
  const tasksT = useTranslations("tasks");
  return (
    <li
      className={`grid min-h-[6.25rem] grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-surface p-3 transition-colors sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-4 sm:p-4 ${
        selected
          ? "border-brand ring-1 ring-brand/20"
          : "border-line hover:border-violet-300"
      }`}
    >
      <label className="flex h-10 w-8 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={t("selectTask", { id: task.id })}
          className="h-4 w-4 accent-brand"
        />
      </label>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-bold text-brand-ink tabular-nums">
        {task.slot}
      </span>
      <Link
        href={href}
        prefetch={false}
        onClick={onOpen}
        className="group min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        {/* Raw HTML is disabled in the repository Markdown renderer. */}
        <div
          className="line-clamp-2 text-sm leading-5 font-semibold text-ink group-hover:text-brand-ink sm:text-[15px] [&_.katex]:text-[0.94em] [&_.katex-display]:m-0 [&_.katex-display]:inline-block [&_br]:hidden [&_img]:hidden [&_p]:inline"
          dangerouslySetInnerHTML={{ __html: task.statementPreviewHtml }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{topicLabel}</span>
          <span aria-hidden>·</span>
          <span>{t("taskCode", { id: task.id })}</span>
          <span aria-hidden>·</span>
          <span>{tasksT("difficulty", { level: task.difficulty })}</span>
        </div>
      </Link>
      <div className="col-start-3 flex items-center justify-between gap-3 sm:col-start-auto sm:justify-end">
        <span className="text-xs font-medium text-muted">
          {t("authoredSource")}
        </span>
        <ProgressBadge progress={progress} />
      </div>
    </li>
  );
}

function ProgressBadge({ progress }: { progress: TaskProgress | null }) {
  const t = useTranslations("taskBank");
  if (progress === null) {
    return <span className="h-5 w-5 animate-pulse rounded-full bg-line" />;
  }
  const config = {
    new: { icon: Circle, className: "text-muted" },
    correct: { icon: CheckCircle2, className: "text-emerald-700" },
    incorrect: { icon: CircleX, className: "text-rose-700" },
  }[progress];
  const Icon = config.icon;
  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-semibold ${config.className}`}
      title={t(`progress.${progress}`)}
    >
      <Icon aria-hidden size={18} />
      <span className="sr-only">{t(`progress.${progress}`)}</span>
    </span>
  );
}
