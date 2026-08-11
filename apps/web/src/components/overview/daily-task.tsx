"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Flame,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAttempts } from "@/lib/attempts-store";
import type { TaskSummary } from "@/lib/content";
import {
  DAILY_TASK_TIME_ZONE,
  isDailyTaskComplete,
  selectDailyTask,
  studyDayStreak,
} from "@/lib/daily-task";
import { taskPracticeHref } from "@/lib/task-bank";

export type DailyTaskCandidate = Pick<
  TaskSummary,
  "id" | "slot" | "topic" | "difficulty" | "statementPreviewHtml"
> & {
  topicLabel: string;
};

export function DailyTask({ tasks }: { tasks: DailyTaskCandidate[] }) {
  const locale = useLocale();
  const t = useTranslations("home.daily");
  const attempts = useAttempts();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const task = useMemo(
    () => (now ? selectDailyTask(tasks, now) : null),
    [now, tasks],
  );
  const dateLabel = useMemo(
    () =>
      now
        ? new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : locale, {
            timeZone: DAILY_TASK_TIME_ZONE,
            day: "numeric",
            month: "long",
          }).format(now)
        : null,
    [locale, now],
  );
  const pending = attempts === null;
  const complete =
    task !== null && now !== null && attempts !== null
      ? isDailyTaskComplete(attempts, task.id, now)
      : false;
  const streak =
    now !== null && attempts !== null ? studyDayStreak(attempts, now) : 0;

  return (
    <section
      data-testid="daily-task"
      data-task-id={task?.id}
      data-task-slot={task?.slot}
      aria-labelledby="daily-task-title"
      className="border-y border-line bg-surface px-5 sm:px-8"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center lg:gap-8 lg:py-6">
        <div className="min-w-0">
          <p className="flex min-h-6 items-center gap-2 text-xs font-bold text-brand-ink uppercase">
            <CalendarDays aria-hidden size={16} />
            {t("kicker")}
            {dateLabel && (
              <span className="font-medium text-muted normal-case">
                · {dateLabel}
              </span>
            )}
          </p>
          <h2 id="daily-task-title" className="mt-1 text-xl font-bold text-ink">
            {t("title")}
          </h2>
          {task ? (
            <>
              {/* Repository Markdown rendering rejects raw HTML. */}
              <div
                className="mt-2 line-clamp-2 text-sm leading-6 font-medium text-ink [&_.katex]:text-[0.95em] [&_.katex-display]:m-0 [&_.katex-display]:inline-block [&_br]:hidden [&_img]:hidden [&_p]:inline"
                dangerouslySetInnerHTML={{
                  __html: task.statementPreviewHtml,
                }}
              />
              <p className="mt-2 text-xs leading-5 text-muted">
                {t("meta", {
                  position: task.slot,
                  topic: task.topicLabel,
                  difficulty: task.difficulty,
                })}
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-2" aria-label={t("loading")}>
              <span className="block h-4 w-full max-w-xl animate-pulse rounded bg-line" />
              <span className="block h-4 w-2/3 max-w-md animate-pulse rounded bg-line" />
            </div>
          )}
        </div>

        <div className="border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
          <div className="grid grid-cols-2 divide-x divide-line">
            <div className="min-w-0 pr-4">
              <p className="text-xs font-medium text-muted">
                {t("statusLabel")}
              </p>
              {pending ? (
                <span className="mt-2 block h-5 w-20 animate-pulse rounded bg-line" />
              ) : (
                <p
                  aria-live="polite"
                  className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${
                    complete ? "text-emerald-700" : "text-muted"
                  }`}
                >
                  {complete ? (
                    <CheckCircle2 aria-hidden size={17} />
                  ) : (
                    <Circle aria-hidden size={17} />
                  )}
                  {complete ? t("completed") : t("notCompleted")}
                </p>
              )}
            </div>
            <div className="min-w-0 pl-4">
              <p className="text-xs font-medium text-muted">
                {t("streakLabel")}
              </p>
              {pending ? (
                <span className="mt-2 block h-5 w-20 animate-pulse rounded bg-line" />
              ) : (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-amber-800">
                  <Flame aria-hidden size={17} />
                  {t("streak", { count: streak })}
                </p>
              )}
            </div>
          </div>
          {task && (
            <Link
              href={taskPracticeHref(task, "/cabinet")}
              prefetch={false}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
            >
              {complete ? t("repeat") : t("solve")}
              <ArrowRight aria-hidden size={17} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
