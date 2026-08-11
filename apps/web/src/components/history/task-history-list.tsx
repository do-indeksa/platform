"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import type { HistoryAttempt } from "@/lib/history-journal";
import {
  taskHistoryHref,
  type TaskHistoryFilters,
} from "@/lib/task-history-filters";
import { HistoryEmpty } from "./history-empty";
import { OutcomeBadge } from "./outcome-badge";
import {
  TaskHistoryFilterControls,
  TaskHistoryFilteredEmpty,
  type TaskHistoryFilterTopic,
} from "./task-history-filters";
import type { HistoryTaskMeta } from "./types";

export function TaskHistoryList({
  entries,
  totalCount,
  taskById,
  filters,
  filterTopics,
  practiceHref,
  errorCount,
  onFiltersChange,
  onFiltersReset,
}: {
  entries: HistoryAttempt[];
  totalCount: number;
  taskById: ReadonlyMap<string, HistoryTaskMeta>;
  filters: TaskHistoryFilters;
  filterTopics: readonly TaskHistoryFilterTopic[];
  practiceHref: string | null;
  errorCount: number;
  onFiltersChange: (filters: TaskHistoryFilters) => void;
  onFiltersReset: () => void;
}) {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;

  if (totalCount === 0) return <HistoryEmpty kind="tasks" />;

  const filterControls = (
    <TaskHistoryFilterControls
      filters={filters}
      topics={filterTopics}
      visibleCount={entries.length}
      totalCount={totalCount}
      onChange={onFiltersChange}
      onReset={onFiltersReset}
    />
  );
  if (entries.length === 0) {
    return (
      <div>
        {filterControls}
        <TaskHistoryFilteredEmpty onReset={onFiltersReset} />
      </div>
    );
  }

  const dateFormatter = new Intl.DateTimeFormat(htmlLanguage(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const returnTo = taskHistoryHref(filters);

  return (
    <div>
      {filterControls}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold text-muted">
            <tr>
              <th className="w-[17%] px-3 py-3 pl-0">{t("dateColumn")}</th>
              <th className="w-[21%] px-3 py-3">{t("taskColumn")}</th>
              <th className="w-[21%] px-3 py-3">{t("topicColumn")}</th>
              <th className="w-[19%] px-3 py-3">{t("answerColumn")}</th>
              <th className="w-[13%] px-3 py-3">{t("resultColumn")}</th>
              <th className="w-[9%] px-3 py-3 pr-0 text-right">
                <span className="sr-only">{t("actionColumn")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <TaskTableRow
                key={entry.id}
                entry={entry}
                task={taskById.get(entry.taskId)}
                date={dateFormatter.format(new Date(entry.at))}
                returnTo={returnTo}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line border-y border-line md:hidden">
        {entries.map((entry) => (
          <TaskMobileRow
            key={entry.id}
            entry={entry}
            task={taskById.get(entry.taskId)}
            date={dateFormatter.format(new Date(entry.at))}
            returnTo={returnTo}
          />
        ))}
      </ul>

      <section className="mt-8 flex flex-col gap-5 rounded-lg bg-subtle p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-bold text-brand-ink">{t("retryErrorsTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {errorCount > 0
              ? t("retryErrorsDescription", { count: errorCount })
              : t("retryErrorsEmpty")}
          </p>
        </div>
        {practiceHref ? (
          <Link
            href={practiceHref}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            {t("retryErrorsCta")}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand opacity-40"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            {t("retryErrorsCta")}
          </button>
        )}
      </section>
    </div>
  );
}

function TaskTableRow({
  entry,
  task,
  date,
  returnTo,
}: {
  entry: HistoryAttempt;
  task: HistoryTaskMeta | undefined;
  date: string;
  returnTo: string;
}) {
  const t = useTranslations("history");
  return (
    <tr className="align-middle">
      <td className="px-3 py-4 pl-0 text-muted">{date}</td>
      <td className="px-3 py-4 font-semibold">
        {t("positionTask", { position: entry.slot, id: entry.taskId })}
        <span className="mt-1 block text-xs font-normal text-muted">
          {t(`source.${entry.source}`)}
        </span>
      </td>
      <td className="px-3 py-4 text-muted">
        {task?.topicName ?? t("unknownTopic")}
      </td>
      <td className="px-3 py-4 font-mono text-xs break-words">
        {answerLabel(entry, t("noAnswer"))}
      </td>
      <td className="px-3 py-4">
        <OutcomeBadge outcome={entry.outcome} />
      </td>
      <td className="px-3 py-4 pr-0 text-right">
        {task ? (
          <Link
            href={detailHref(entry, task, returnTo)}
            aria-label={t("openTaskAttempt", { id: entry.taskId })}
            className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand-ink hover:text-brand"
          >
            {t("open")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-xs text-muted">{t("unavailable")}</span>
        )}
      </td>
    </tr>
  );
}

function TaskMobileRow({
  entry,
  task,
  date,
  returnTo,
}: {
  entry: HistoryAttempt;
  task: HistoryTaskMeta | undefined;
  date: string;
  returnTo: string;
}) {
  const t = useTranslations("history");
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {t("positionTask", { position: entry.slot, id: entry.taskId })}
          </p>
          <p className="mt-1 text-sm text-muted">
            {task?.topicName ?? t("unknownTopic")}
          </p>
        </div>
        <OutcomeBadge outcome={entry.outcome} />
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {date} · {t(`source.${entry.source}`)}
          </p>
          <p className="mt-1 truncate font-mono text-xs">
            {answerLabel(entry, t("noAnswer"))}
          </p>
        </div>
        {task && <ArrowRight aria-hidden className="h-4 w-4 text-brand" />}
      </div>
    </>
  );

  return (
    <li>
      {task ? (
        <Link
          href={detailHref(entry, task, returnTo)}
          aria-label={t("openTaskAttempt", { id: entry.taskId })}
          className="block py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {content}
        </Link>
      ) : (
        <div className="py-5">{content}</div>
      )}
    </li>
  );
}

function answerLabel(entry: HistoryAttempt, fallback: string): string {
  const answers = entry.answers.filter((answer) => answer.trim() !== "");
  return answers.length > 0 ? answers.join(" · ") : fallback;
}

function detailHref(
  entry: HistoryAttempt,
  task: HistoryTaskMeta,
  returnTo: string,
): string {
  const query = new URLSearchParams({ attempt: entry.id, returnTo });
  return `/history/tasks/${task.topic}/${task.id}?${query}`;
}
