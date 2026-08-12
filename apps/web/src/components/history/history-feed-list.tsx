"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Grid3X3,
  Lightbulb,
  Minus,
  Square,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import type {
  HistoryFeedItem,
  HistoryMockFeedItem,
  HistoryTaskFeedItem,
  HistoryTaskMeta,
  HistoryTrainingFeedItem,
} from "@/lib/history-feed";
import {
  isSimulationBlueprintVersion,
  isSimulationRunId,
  isSimulationTaskRevision,
  simulationResultHref,
} from "@/lib/simulation-run";
import { simulationEntrySnapshot } from "@/lib/simulation-archive";

const INITIAL_VISIBLE_ROWS = 6;

export function HistoryFeedList({
  items,
  taskById,
  returnTo,
}: {
  items: readonly HistoryFeedItem[];
  taskById: ReadonlyMap<string, HistoryTaskMeta>;
  returnTo: string;
}) {
  const t = useTranslations("history.feed");
  const locale = useLocale() as AppLocale;
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS);
  const dateFormatter = new Intl.DateTimeFormat(htmlLanguage(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const visible = items.slice(0, visibleRows);

  return (
    <div>
      <ol
        data-testid="history-feed"
        className="grid gap-px overflow-hidden md:gap-0 md:border-x md:border-line"
      >
        {visible.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            {item.kind === "task" ? (
              <TaskRow
                item={item}
                task={taskById.get(item.taskId)}
                date={dateFormatter.format(new Date(item.at))}
                returnTo={returnTo}
              />
            ) : item.kind === "training" ? (
              <TrainingRow
                item={item}
                date={dateFormatter.format(new Date(item.at))}
              />
            ) : (
              <MockRow
                item={item}
                date={dateFormatter.format(new Date(item.at))}
              />
            )}
          </li>
        ))}
      </ol>

      {visibleRows < items.length && (
        <button
          type="button"
          onClick={() => setVisibleRows((count) => count + 6)}
          className="mt-3.5 inline-flex h-[42px] w-40 items-center justify-center gap-2 rounded-[9px] border border-line bg-surface text-xs leading-4 font-medium text-ink transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("showMore")}
          <ChevronDown aria-hidden size={12} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function TaskRow({
  item,
  task,
  date,
  returnTo,
}: {
  item: HistoryTaskFeedItem;
  task: HistoryTaskMeta | undefined;
  date: string;
  returnTo: string;
}) {
  const t = useTranslations("history.feed");
  const href = task ? taskDetailHref(item, task, returnTo) : null;
  const tone = taskTone(item);

  return (
    <HistoryRow
      href={href}
      label={t("openTask", { id: item.taskId })}
      icon={taskIcon(item)}
      iconClassName={tone.icon}
      title={t("taskTitle", { id: item.taskId })}
      subtitle={`FTN P1 · ${item.topicName}`}
      date={date}
      result={
        <span
          className={`inline-flex h-[30px] max-w-[118px] items-center justify-center truncate rounded-lg px-2.5 text-xs leading-4 font-medium ${tone.result}`}
        >
          {item.helpLevel > 0 && item.outcome !== "correct"
            ? t("withHelp")
            : t(`outcome.${item.outcome}`)}
        </span>
      }
    />
  );
}

function TrainingRow({
  item,
  date,
}: {
  item: HistoryTrainingFeedItem;
  date: string;
}) {
  const t = useTranslations("history.feed");
  return (
    <HistoryRow
      href={null}
      label={t("trainingTitle")}
      icon={<Grid3X3 aria-hidden size={16} strokeWidth={1.6} />}
      iconClassName="bg-subtle text-brand"
      title={
        item.runKind === "DIAGNOSTIC"
          ? t("diagnosticTitle")
          : t("trainingTitle")
      }
      subtitle={t("trainingSubtitle", { count: item.itemCount })}
      date={date}
      result={
        item.earnedPoints !== undefined && item.maxPoints !== undefined ? (
          <span className="inline-flex h-[52px] min-w-[52px] items-center justify-center rounded-full border-[3px] border-brand bg-surface px-1 text-sm leading-5 font-semibold tabular-nums text-ink">
            {item.earnedPoints}/{item.maxPoints}
          </span>
        ) : (
          <span className="inline-flex h-[52px] min-w-[52px] items-center justify-center rounded-full border-[3px] border-brand bg-surface px-1 text-sm leading-5 font-semibold tabular-nums text-ink">
            {item.correctItemCount}/{item.itemCount}
          </span>
        )
      }
    />
  );
}

function MockRow({ item, date }: { item: HistoryMockFeedItem; date: string }) {
  const t = useTranslations("history.feed");
  const href = mockResultHref(item.run);
  const score = item.run.score;
  const scoreTone =
    score === null
      ? "bg-zinc-100 text-muted"
      : score >= 42
        ? "bg-emerald-50 text-emerald-700"
        : score >= 30
          ? "bg-amber-50 text-amber-700"
          : "bg-red-50 text-red-700";
  return (
    <HistoryRow
      href={href}
      label={t("openMock")}
      icon={<ClipboardCheck aria-hidden size={17} strokeWidth={1.6} />}
      iconClassName="bg-amber-50 text-brand"
      title={t("mockTitle")}
      subtitle={t("mockSubtitle", { count: item.run.taskIds.length })}
      date={date}
      result={
        <span
          className={`inline-flex h-[30px] items-center justify-center rounded-lg px-2.5 text-xs leading-4 font-medium tabular-nums ${scoreTone}`}
        >
          {score === null
            ? t("pendingScore")
            : t("score", { score, max: item.run.maxPoints })}
        </span>
      }
    />
  );
}

function HistoryRow({
  href,
  label,
  icon,
  iconClassName,
  title,
  subtitle,
  date,
  result,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
  iconClassName: string;
  title: string;
  subtitle: string;
  date: string;
  result: React.ReactNode;
}) {
  const content = (
    <div className="grid h-24 grid-cols-[36px_minmax(0,1fr)_auto] grid-rows-[52px_32px] items-center gap-x-2.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 md:h-[72px] md:grid-cols-[36px_minmax(0,1fr)_auto_auto_12px] md:grid-rows-1 md:gap-x-3 md:rounded-none md:border-x-0 md:px-3.5 md:py-2.5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[9px] ${iconClassName}`}
      >
        {icon}
      </span>
      <span className="min-w-0 self-center">
        <span className="block truncate text-sm leading-5 font-semibold text-ink">
          {title}
        </span>
        <span className="block truncate text-xs leading-4 font-medium text-muted">
          {subtitle}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        size={13}
        strokeWidth={1.7}
        className="text-muted md:col-start-5"
      />
      <span className="col-span-2 row-start-2 truncate text-xs leading-4 font-medium text-muted md:col-span-1 md:col-start-3 md:row-start-1 md:max-w-44">
        {date}
      </span>
      <span className="col-start-3 row-start-2 justify-self-end md:col-start-4 md:row-start-1 md:justify-self-auto">
        {result}
      </span>
    </div>
  );
  return href ? (
    <Link
      href={href}
      aria-label={label}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    >
      {content}
    </Link>
  ) : (
    <div aria-label={label}>{content}</div>
  );
}

function taskIcon(item: HistoryTaskFeedItem): React.ReactNode {
  const props = { "aria-hidden": true, size: 17, strokeWidth: 1.7 } as const;
  if (item.helpLevel > 0 && item.outcome !== "correct") {
    return <Lightbulb {...props} />;
  }
  if (item.outcome === "correct") return <Check {...props} />;
  if (item.outcome === "incorrect") return <X {...props} />;
  if (item.outcome === "skipped") return <Minus {...props} />;
  return <Square {...props} />;
}

function taskTone(item: HistoryTaskFeedItem) {
  if (item.helpLevel > 0 && item.outcome !== "correct") {
    return { icon: "bg-subtle text-brand", result: "bg-subtle text-brand-ink" };
  }
  switch (item.outcome) {
    case "correct":
      return {
        icon: "bg-emerald-50 text-emerald-700",
        result: "bg-emerald-50 text-emerald-700",
      };
    case "incorrect":
      return {
        icon: "bg-red-50 text-red-700",
        result: "bg-red-50 text-red-700",
      };
    case "partial":
      return {
        icon: "bg-amber-50 text-amber-700",
        result: "bg-amber-50 text-amber-700",
      };
    default:
      return {
        icon: "bg-zinc-50 text-muted",
        result: "bg-zinc-50 text-muted",
      };
  }
}

function taskDetailHref(
  item: HistoryTaskFeedItem,
  task: HistoryTaskMeta,
  returnTo: string,
): string {
  const query = new URLSearchParams({ attempt: item.id, returnTo });
  if (item.taskRevision !== undefined) query.set("revision", item.taskRevision);
  return `/history/tasks/${task.topic}/${task.id}?${query}`;
}

function mockResultHref(run: HistoryMockFeedItem["run"]): string | null {
  if (
    run.historyEntry === null ||
    !isSimulationRunId(run.id) ||
    !isSimulationBlueprintVersion(run.blueprintVersion)
  ) {
    return null;
  }
  const snapshot = simulationEntrySnapshot(run.historyEntry);
  const revisions =
    snapshot !== undefined &&
    snapshot.taskRevisions.length === run.taskIds.length &&
    snapshot.taskRevisions.every(isSimulationTaskRevision)
      ? snapshot.taskRevisions
      : undefined;
  return simulationResultHref(
    {
      runId: run.id,
      blueprintVersion: run.blueprintVersion,
      taskIds: run.taskIds,
    },
    revisions,
  );
}
