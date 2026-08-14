"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { htmlLanguage, type AppLocale } from "@/i18n/routing";
import type { HistoryAttempt } from "@/lib/history-journal";
import type { SimulationArchiveRun } from "@/lib/simulation-archive";
import { taskPracticeHref } from "@/lib/task-bank";
import type { CabinetExam, CabinetTask } from "./cabinet-model";
import { CabinetLinkButton } from "./cabinet-link-button";

export function CabinetLatestResults({
  exam,
  mock,
  practice,
  tasks,
}: {
  exam: CabinetExam;
  mock: SimulationArchiveRun | null;
  practice: HistoryAttempt | null;
  tasks: readonly CabinetTask[];
}) {
  const t = useTranslations("cabinet.results");
  const locale = useLocale();
  const practiceTask = tasks.find(({ id }) => id === practice?.taskId);
  const date = (value: number | string) =>
    new Intl.DateTimeFormat(htmlLanguage(locale as AppLocale), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  const practiceScore = practiceScoreValue(practice);

  return (
    <section
      data-testid="cabinet-latest-results"
      aria-labelledby="cabinet-results-title"
      className="flex h-[650px] flex-col items-start gap-[18px] overflow-hidden rounded-[20px] border border-line bg-surface p-6 md:h-[548px] md:p-7 xl:h-[330px]"
    >
      <div className="flex h-[54px] w-full items-start justify-between md:h-8">
        <h2
          id="cabinet-results-title"
          className="text-[22px] leading-[1.4] font-semibold"
        >
          {t("title")}
        </h2>
        <Link
          href="/history"
          className="inline-flex w-[82px] items-start gap-2 text-[13px] leading-[1.4] font-medium text-brand-ink hover:underline md:w-[130px] md:justify-end"
        >
          {t("history")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex h-[538px] w-full flex-col gap-4 md:h-[452px] md:gap-5 xl:h-56 xl:flex-row">
        <ResultCard
          tone="mock"
          title={t("mock.title")}
          meta={
            mock
              ? t("mock.meta", { date: date(mock.finishedAt) })
              : t("mock.empty")
          }
          score={`${mock?.score ?? "—"} / ${exam.maxPoints}`}
          progress={
            mock?.score === null || !mock ? 0 : mock.score / exam.maxPoints
          }
          image="/cabinet/mock-checklist.png"
        >
          <CabinetLinkButton
            href={mock ? "/history" : "/simulation"}
            className="w-[180px] md:w-[200px]"
          >
            {mock ? t("mock.analyze") : t("mock.start")}
          </CabinetLinkButton>
        </ResultCard>

        <ResultCard
          tone="practice"
          title={t("practice.title")}
          meta={
            practice
              ? t("practice.meta", {
                  position: practice.slot,
                  topic: practiceTask?.topicLabel ?? t("practice.taskFallback"),
                  date: date(practice.at),
                })
              : t("practice.empty")
          }
          score={practiceScore.label}
          progress={practiceScore.progress}
          image="/cabinet/practice-trophy.png"
        >
          <CabinetLinkButton
            href={
              practiceTask
                ? taskPracticeHref(practiceTask, "/cabinet")
                : "/tasks"
            }
            className="w-[180px] md:w-[200px]"
          >
            {practiceTask ? t("practice.repeat") : t("practice.start")}
          </CabinetLinkButton>
        </ResultCard>
      </div>
    </section>
  );
}

function ResultCard({
  tone,
  title,
  meta,
  score,
  progress,
  image,
  children,
}: {
  tone: "mock" | "practice";
  title: string;
  meta: string;
  score: string;
  progress: number;
  image: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`flex h-[260px] w-full shrink-0 items-center justify-between overflow-hidden rounded-[18px] p-4 md:h-[216px] md:p-6 xl:h-56 xl:w-auto xl:flex-1 ${
        tone === "mock" ? "bg-subtle" : "bg-warning-subtle"
      }`}
    >
      <div className="flex h-[220px] w-[180px] shrink-0 flex-col items-start gap-2 md:h-[172px] md:w-[350px]">
        <h3 className="w-full text-[17px] leading-[1.4] font-semibold">
          {title}
        </h3>
        <p className="w-full text-xs leading-[1.4] text-muted">{meta}</p>
        <p
          className={`w-full text-[32px] leading-[1.4] font-bold ${
            tone === "mock" ? "text-brand-ink" : "text-warning"
          }`}
        >
          {score}
        </p>
        <div className="h-1.5 w-40 shrink-0 overflow-hidden rounded-[3px] bg-progress-track md:w-[250px]">
          <div
            className="h-full rounded-[3px] bg-progress"
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
        {children}
      </div>
      <div className="flex h-[120px] w-[86px] shrink-0 items-center justify-center md:h-[170px] md:w-[180px]">
        <Image
          src={image}
          alt=""
          width={1536}
          height={1024}
          sizes="(max-width: 767px) 86px, 180px"
          className="h-full w-full object-contain"
        />
      </div>
    </article>
  );
}

function practiceScoreValue(practice: HistoryAttempt | null): {
  label: string;
  progress: number;
} {
  if (!practice) return { label: "— / 1", progress: 0 };
  if (practice.outcome === "correct") return { label: "1 / 1", progress: 1 };
  if (practice.outcome === "partial") {
    const score =
      practice.earnedPoints !== undefined && practice.maxPoints
        ? practice.earnedPoints / practice.maxPoints
        : 0.5;
    return { label: "½ / 1", progress: score };
  }
  return { label: "0 / 1", progress: 0 };
}
