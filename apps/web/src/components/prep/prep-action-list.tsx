"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PrepAction } from "@/lib/prep-plan";
import {
  actionReason,
  actionTitle,
  actionType,
  actionVolume,
} from "./prep-action-copy";

export function NextActionCard({
  action,
  href,
  onOpenSettings,
}: {
  action: PrepAction | null;
  href: string;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("prep");

  if (!action) {
    return (
      <section className="overflow-hidden rounded-lg bg-emphasis px-5 py-6 text-white sm:px-7 sm:py-7">
        <CheckCircle2 aria-hidden className="h-7 w-7 text-emerald-400" />
        <p className="mt-4 text-sm font-semibold text-emerald-300">
          {t("nextEyebrow")}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{t("allDoneTitle")}</h2>
        <p className="mt-2 max-w-xl leading-7 text-zinc-300">
          {t("allDoneDescription")}
        </p>
        <Link
          href="/tasks"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
        >
          {t("browseTasks")}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  const content = (
    <>
      {t("startAction")}
      <ArrowRight aria-hidden className="h-4 w-4" />
    </>
  );

  return (
    <section
      data-testid="next-action"
      className="overflow-hidden rounded-lg bg-emphasis px-5 py-6 text-white sm:px-7 sm:py-7"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
        <Sparkles aria-hidden className="h-4 w-4" />
        {t("nextEyebrow")}
      </div>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-8">
            {actionTitle(t, action)}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
            {actionReason(t, action)}
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Clock3 aria-hidden className="h-4 w-4" />
            {t("estimatedMinutes", { minutes: action.minutes })}
          </p>
        </div>
        {action.kind === "settings" ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            {content}
          </button>
        ) : (
          <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            {content}
          </Link>
        )}
      </div>
    </section>
  );
}

export function TodayPlan({
  actions,
  nextActionId,
  hrefFor,
  onOpenSettings,
}: {
  actions: PrepAction[];
  nextActionId: string | null;
  hrefFor: (action: PrepAction) => string;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("prep");

  return (
    <section className="mt-9" aria-labelledby="today-plan-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-ink">
            {t("todayEyebrow")}
          </p>
          <h2 id="today-plan-title" className="mt-1 text-2xl font-bold">
            {t("todayTitle")}
          </h2>
        </div>
        <span className="text-sm font-medium text-muted">
          {t("actionsCount", { count: actions.length })}
        </span>
      </div>
      <ol className="mt-5 border-t border-line">
        {actions.map((action, index) => (
          <ActionRow
            key={action.id}
            action={action}
            index={index + 1}
            current={action.id === nextActionId}
            href={hrefFor(action)}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </ol>
    </section>
  );
}

function ActionRow({
  action,
  index,
  current,
  href,
  onOpenSettings,
}: {
  action: PrepAction;
  index: number;
  current: boolean;
  href: string;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("prep");
  const content = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
          action.completed
            ? "bg-emerald-600 text-white"
            : current
              ? "bg-subtle text-brand-ink"
              : "bg-zinc-100 text-muted"
        }`}
      >
        {action.completed ? <Check aria-hidden className="h-4 w-4" /> : index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5">
          {actionTitle(t, action)}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-5 text-muted">
          <span>{actionType(t, action.kind)}</span>
          <span aria-hidden>·</span>
          <span>{actionVolume(t, action)}</span>
          <span aria-hidden>·</span>
          <span>{t("estimatedMinutes", { minutes: action.minutes })}</span>
        </span>
      </span>
      {action.completed ? (
        <span className="hidden text-xs font-semibold text-emerald-700 sm:inline">
          {t("completed")}
        </span>
      ) : (
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
      )}
    </>
  );
  const classes = `flex min-h-20 w-full items-center gap-3 border-b border-line px-1 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    action.completed ? "bg-emerald-50/70" : "hover:bg-page"
  }`;

  return (
    <li data-testid={`prep-action-${action.kind}`}>
      {action.kind === "settings" ? (
        <button type="button" onClick={onOpenSettings} className={classes}>
          {content}
        </button>
      ) : (
        <Link href={href} className={classes}>
          {content}
        </Link>
      )}
    </li>
  );
}
