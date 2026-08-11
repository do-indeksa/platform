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
      className="flex h-[650px] flex-col rounded-[20px] border border-line bg-surface p-4 md:h-[548px] md:p-7 xl:h-[330px]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="cabinet-results-title"
          className="text-xl leading-7 font-bold md:text-2xl md:leading-8"
        >
          {t("title")}
        </h2>
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-xs font-medium text-brand hover:underline md:text-sm"
        >
          {t("history")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid flex-1 gap-4 md:grid-rows-2 md:gap-5 xl:grid-cols-2 xl:grid-rows-1">
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
          imageClass="w-[94px] md:w-[112px]"
        >
          <CabinetLinkButton
            href={mock ? "/history" : "/simulation"}
            className="w-full md:w-[200px]"
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
          imageClass="w-[112px] md:w-[138px]"
        >
          <CabinetLinkButton
            href={
              practiceTask
                ? taskPracticeHref(practiceTask, "/cabinet")
                : "/tasks"
            }
            className="w-full md:w-[200px]"
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
  imageClass,
  children,
}: {
  tone: "mock" | "practice";
  title: string;
  meta: string;
  score: string;
  progress: number;
  image: string;
  imageClass: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl p-4 md:p-6 ${
        tone === "mock" ? "bg-subtle" : "bg-[#fff8e8]"
      }`}
    >
      <div className="relative z-10 flex h-full max-w-[72%] flex-col md:max-w-[70%] xl:max-w-[65%]">
        <h3 className="text-base font-bold md:text-lg">{title}</h3>
        <p className="mt-1 min-h-8 text-[11px] leading-4 text-muted md:text-xs">
          {meta}
        </p>
        <p
          className={`mt-1 text-[30px] leading-9 font-bold md:text-[34px] ${
            tone === "mock" ? "text-[#4b22d5]" : "text-[#a96100]"
          }`}
        >
          {score}
        </p>
        <div className="mt-2 h-1 w-full max-w-[250px] overflow-hidden rounded-full bg-[#e7f8f3]">
          <div
            className="h-full rounded-full bg-[#159a78]"
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
        <div className="mt-auto">{children}</div>
      </div>
      <Image
        src={image}
        alt=""
        width={1536}
        height={1024}
        sizes="140px"
        className={`absolute right-3 bottom-12 h-auto object-contain md:right-6 md:bottom-10 ${imageClass}`}
      />
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
