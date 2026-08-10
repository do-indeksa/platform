"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  Target,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { diagnosticPracticeSet } from "@/lib/diagnostic-result";
import { useDiagnostic, type DiagnosticOutcome } from "@/lib/diagnostic-store";
import { useHydrated } from "@/lib/use-hydrated";
import { taskPracticeHref } from "@/lib/task-bank";
import type { DiagnosticResultTask } from "./types";

export function DiagnosticResult({
  runId,
  tasks,
}: {
  runId: string;
  tasks: DiagnosticResultTask[];
}) {
  const t = useTranslations("diagnostic");
  const hydrated = useHydrated();
  const state = useDiagnostic();
  const matchingRun =
    state.runId === runId &&
    state.taskIds.length === tasks.length &&
    state.taskIds.every((taskId, index) => taskId === tasks[index].id);

  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-80 max-w-5xl items-center justify-center px-5">
        <p className="flex items-center gap-3 text-muted">
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
          {t("loading")}
        </p>
      </main>
    );
  }
  if (!matchingRun || state.phase !== "done") {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-16 text-center sm:px-8">
        <CircleDashed
          aria-hidden="true"
          className="mx-auto h-10 w-10 text-muted"
        />
        <h1 className="mt-5 text-3xl font-bold">{t("missingResultTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
          {t("missingResultBody")}
        </p>
        <Link
          href="/diagnostic"
          className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-ink"
        >
          {t("back")}
        </Link>
      </main>
    );
  }

  const grouped = groupTasks(tasks, state.outcomes);
  const practiceSet = diagnosticPracticeSet(tasks, state.outcomes);
  const practiceHref = taskPracticeHref(
    practiceSet[0],
    "/prep",
    practiceSet.map((task) => task.id),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="text-sm font-semibold text-brand-ink">{t("kicker")}</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
        {t("resultTitle")}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
        {t("resultIntro")}
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <ResultGroup
          icon={CheckCircle2}
          tone="confident"
          title={t("confidentTitle")}
          description={t("confidentDescription")}
          empty={t("confidentEmpty")}
          tasks={grouped.correct}
        />
        <ResultGroup
          icon={Target}
          tone="attention"
          title={t("startHereTitle")}
          description={t("startHereDescription")}
          empty={t("startHereEmpty")}
          tasks={grouped.incorrect}
        />
        <ResultGroup
          icon={CircleDashed}
          tone="untested"
          title={t("untestedTitle")}
          description={t("untestedDescription")}
          empty={t("untestedEmpty")}
          tasks={grouped.skipped}
        />
      </div>

      <section className="mt-8 border-y border-line bg-subtle px-5 py-7 sm:px-7">
        <p className="text-sm font-semibold text-brand-ink">
          {t("firstStepTitle")}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{t("firstStepHeading")}</h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          {t("firstStepDescription")}
        </p>
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href={practiceHref}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-ink"
          >
            {t("startPractice")}
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Link
            href="/prep"
            className="inline-flex min-h-12 items-center px-3 py-3 font-medium text-brand-ink hover:underline"
          >
            {t("fullPlan")}
          </Link>
        </div>
      </section>
    </main>
  );
}

function groupTasks(
  tasks: readonly DiagnosticResultTask[],
  outcomes: readonly (DiagnosticOutcome | null)[],
) {
  return {
    correct: tasks.filter((_, index) => outcomes[index] === "correct"),
    incorrect: tasks.filter((_, index) => outcomes[index] === "incorrect"),
    skipped: tasks.filter((_, index) => outcomes[index] === "skipped"),
  };
}

const TONES = {
  confident: "border-emerald-200 bg-emerald-50 text-emerald-800",
  attention: "border-rose-200 bg-rose-50 text-rose-800",
  untested: "border-line bg-surface text-muted",
} as const;

function ResultGroup({
  icon: Icon,
  tone,
  title,
  description,
  empty,
  tasks,
}: {
  icon: typeof CheckCircle2;
  tone: keyof typeof TONES;
  title: string;
  description: string;
  empty: string;
  tasks: DiagnosticResultTask[];
}) {
  const t = useTranslations("diagnostic");
  return (
    <section className={`rounded-lg border p-5 ${TONES[tone]}`}>
      <Icon aria-hidden="true" className="h-6 w-6" />
      <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 min-h-12 text-sm leading-6">{description}</p>
      {tasks.length > 0 ? (
        <ul className="mt-5 space-y-2 border-t border-current/15 pt-4 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="leading-5 text-ink">
              {t("positionItem", {
                position: task.examPosition,
                topic: task.topicName,
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 border-t border-current/15 pt-4 text-sm">{empty}</p>
      )}
    </section>
  );
}
