import { ArrowRight, CheckCircle2, ScanSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OverviewExam } from "@/lib/overview";

export function OverviewHero({
  exam,
  publishedTaskCount,
}: {
  exam: OverviewExam;
  publishedTaskCount: number;
}) {
  const t = useTranslations("home");
  const hours = exam.durationMinutes / 60;

  return (
    <section
      aria-labelledby="overview-title"
      className="px-5 py-5 sm:px-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-brand-ink sm:text-sm">
          <span>{t("context")}</span>
          <span className="inline-flex min-h-7 items-center gap-1.5 rounded-md bg-subtle px-2.5">
            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
            {t("verifiedFormat", { version: exam.version })}
          </span>
        </div>
        <h1
          id="overview-title"
          className="mt-2 max-w-3xl text-3xl font-bold leading-9 sm:mt-3 sm:text-4xl sm:leading-tight"
        >
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:mt-3 sm:text-base sm:leading-7">
          {t("intro", {
            tasks: exam.taskCount,
            hours,
            points: exam.maxPoints,
          })}
        </p>

        <dl className="mt-4 flex max-w-2xl divide-x divide-line border-y border-line py-3 sm:mt-5">
          <Fact value={publishedTaskCount} label={t("facts.publishedTasks")} />
          <Fact value={exam.taskCount} label={t("facts.positions")} />
          <Fact value={`${hours} h`} label={t("facts.duration")} />
        </dl>

        <div className="mt-4 grid max-w-xl grid-cols-2 gap-2.5 sm:mt-5 sm:flex sm:gap-3">
          <Link
            href="/tasks"
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-center text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-5"
          >
            {t("startPractice")}
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
          </Link>
          <Link
            href="/diagnostic"
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-center text-sm font-semibold transition-colors hover:border-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-5"
          >
            <ScanSearch aria-hidden className="h-4 w-4 shrink-0" />
            {t("checkLevel")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Fact({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col px-3 first:pl-0 last:pr-0 sm:px-5">
      <dt className="order-2 mt-0.5 text-[11px] leading-4 text-muted sm:text-xs">
        {label}
      </dt>
      <dd className="order-1 text-lg font-bold tabular-nums sm:text-xl">
        {value}
      </dd>
    </div>
  );
}
