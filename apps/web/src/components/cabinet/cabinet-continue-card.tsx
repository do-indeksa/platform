"use client";

import { BookOpen, Clock, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { taskPracticeHref } from "@/lib/task-bank";
import {
  summarizeCabinetPracticeResume,
  type CabinetExam,
  type CabinetPractice,
  type CabinetTask,
} from "./cabinet-model";
import { CabinetLinkButton } from "./cabinet-link-button";
import type { CabinetResume } from "./use-cabinet-resume";

type ContinueCardProps = {
  exam: CabinetExam;
  practice: CabinetPractice | null;
  resume: CabinetResume | null;
  started: boolean;
  tasks: readonly CabinetTask[];
};

export function CabinetContinueCard({
  exam,
  practice,
  resume,
  started,
  tasks,
}: ContinueCardProps) {
  const t = useTranslations("cabinet.continue");
  const content = continueContent({
    exam,
    practice,
    resume,
    started,
    tasks,
    t,
  });
  const exact =
    resume === null || resume.kind === "mock" || resume.kind === "practice"
      ? "figma"
      : "provisional";

  return (
    <section
      data-testid="continue-run"
      data-design-status={exact}
      className="flex h-[642px] flex-col items-center gap-[18px] overflow-hidden rounded-[20px] bg-subtle p-6 md:h-[322px] md:flex-row md:justify-between md:gap-0 md:p-7 xl:p-8"
      aria-labelledby="cabinet-continue-title"
    >
      <div
        data-testid="continue-run-content"
        className="flex h-[394px] w-full min-w-0 flex-col items-start gap-3 overflow-hidden md:h-[242px] md:w-[520px] md:shrink-0 xl:w-[760px]"
      >
        <p className="w-full text-xs leading-[1.4] font-semibold text-brand-ink uppercase">
          {content.kicker}
        </p>
        <h2
          id="cabinet-continue-title"
          className="max-w-[300px] text-[30px] leading-[1.4] font-bold md:max-w-none"
        >
          {content.title}
        </h2>
        <p className="w-full text-[15px] leading-[1.4]">
          {content.description}
        </p>

        <div className="flex h-[22px] w-full items-center gap-[14px] md:h-5 md:w-[394px] xl:w-[534px]">
          <div
            role="progressbar"
            aria-label={t("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={content.progress}
            className="h-1.5 w-[250px] shrink-0 overflow-hidden rounded-[3px] bg-progress-track md:w-[330px] xl:w-[470px]"
          >
            <div
              className="h-full rounded-[3px] bg-progress"
              style={{ width: `${content.progress}%` }}
            />
          </div>
          <span className="w-[46px] text-left text-sm leading-[1.4] font-semibold md:w-[50px]">
            {content.progress}%
          </span>
        </div>

        <div className="flex h-[82px] w-full flex-col gap-2.5 md:h-[34px] md:w-[398px] md:flex-row">
          {content.meta.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-surface px-3 text-[13px] leading-[1.4] text-muted md:h-[34px] md:w-[194px]"
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="flex h-[108px] w-full flex-col gap-3 md:h-12 md:w-[422px] md:flex-row">
          <CabinetLinkButton
            href={content.primaryHref}
            variant="primary"
            className="w-full md:w-[180px]"
          >
            {content.primaryLabel}
          </CabinetLinkButton>
          <CabinetLinkButton
            href={content.secondaryHref}
            className="w-full md:w-[230px]"
          >
            {content.secondaryLabel}
          </CabinetLinkButton>
        </div>
      </div>

      <div
        data-testid="continue-run-artwork"
        className="flex h-[190px] w-[260px] shrink-0 items-center justify-center md:h-[220px] xl:h-[258px] xl:w-[360px]"
      >
        <Image
          src="/cabinet/preparation-book.png"
          alt=""
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 767px) 260px, (max-width: 1279px) 260px, 360px"
          className="h-full w-full object-contain"
        />
      </div>
    </section>
  );
}

type CardContent = {
  kicker: string;
  title: string;
  description: string;
  progress: number;
  meta: { icon: typeof Clock; label: string }[];
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

function continueContent({
  exam,
  practice,
  resume,
  started,
  tasks,
  t,
}: ContinueCardProps & {
  t: ReturnType<typeof useTranslations<"cabinet.continue">>;
}): CardContent {
  if (resume?.kind === "mock") {
    const progress = percent(resume.answered, resume.total);
    return {
      kicker: t("mock.kicker"),
      title: t("mock.title"),
      description: t("mock.description", {
        answered: resume.answered,
        total: resume.total,
      }),
      progress,
      meta: [
        {
          icon: Clock,
          label: t("mock.remaining", { minutes: resume.remainingMinutes }),
        },
        { icon: BookOpen, label: t("mock.subject") },
      ],
      primaryHref: resume.href,
      primaryLabel: t("mock.primary"),
      secondaryHref: "/simulation",
      secondaryLabel: t("mock.secondary"),
    };
  }

  if (resume?.kind === "diagnostic") {
    const progress = percent(resume.answered, resume.total);
    return {
      kicker: t("diagnostic.kicker"),
      title: t("diagnostic.title"),
      description: t("diagnostic.description", {
        current: resume.current,
        total: resume.total,
      }),
      progress,
      meta: [
        { icon: Clock, label: t("diagnostic.minutes") },
        { icon: Sparkles, label: t("diagnostic.meta") },
      ],
      primaryHref: resume.href,
      primaryLabel: t("diagnostic.primary"),
      secondaryHref: "/diagnostic",
      secondaryLabel: t("diagnostic.secondary"),
    };
  }

  if (resume?.kind === "practice") {
    const summary = summarizeCabinetPracticeResume(resume, tasks);
    if (summary !== null) {
      return {
        kicker: t("practice.kicker"),
        title: t("practice.title", {
          position: summary.task.slot,
          topic: summary.task.topicLabel,
        }),
        description: t("practice.description", {
          completed: summary.completed,
          total: summary.total,
        }),
        progress: summary.progress,
        meta: [
          {
            icon: Clock,
            label: t("practice.minutes", { minutes: summary.minutes }),
          },
          {
            icon: Sparkles,
            label: t(`practice.difficulty.${summary.difficulty}`),
          },
        ],
        primaryHref: resume.href,
        primaryLabel: t("practice.primary"),
        secondaryHref: `/tasks?position=${summary.task.slot}`,
        secondaryLabel: t("practice.secondary"),
      };
    }
  }

  if (
    resume?.kind === "diagnosticConflict" ||
    resume?.kind === "simulationConflict"
  ) {
    const kind = resume.kind === "diagnosticConflict" ? "diagnostic" : "mock";
    return {
      kicker: t("conflict.kicker"),
      title: t(`conflict.${kind}Title`),
      description: t("conflict.description"),
      progress: 0,
      meta: [
        { icon: Clock, label: t("conflict.minutes") },
        { icon: Sparkles, label: t("conflict.meta") },
      ],
      primaryHref: resume.href,
      primaryLabel: t("conflict.primary"),
      secondaryHref: "/history",
      secondaryLabel: t("conflict.secondary"),
    };
  }

  if (started && practice) {
    const firstTask = tasks.find(({ id }) => id === practice.taskIds[0]);
    const href = taskPracticeHref(firstTask, "/cabinet", practice.taskIds);
    return {
      kicker: t("practice.kicker"),
      title: t("practice.title", {
        position: practice.position.number,
        topic: practice.position.name,
      }),
      description: t("practice.description", {
        completed: practice.completed,
        total: practice.target,
      }),
      progress: practice.progress,
      meta: [
        {
          icon: Clock,
          label: t("practice.minutes", { minutes: practice.minutes }),
        },
        {
          icon: Sparkles,
          label: t(`practice.difficulty.${practice.difficulty}`),
        },
      ],
      primaryHref: href,
      primaryLabel: t("practice.primary"),
      secondaryHref: `/tasks?position=${practice.position.number}`,
      secondaryLabel: t("practice.secondary"),
    };
  }

  return {
    kicker: t("start.kicker"),
    title: t("start.title"),
    description: t("start.description"),
    progress: 0,
    meta: [
      { icon: Clock, label: t("start.minutes") },
      {
        icon: Sparkles,
        label: t("start.format", {
          tasks: exam.taskCount,
          minutes: exam.durationMinutes,
        }),
      },
    ],
    primaryHref: "/tasks",
    primaryLabel: t("start.primary"),
    secondaryHref: "/diagnostic",
    secondaryLabel: t("start.secondary"),
  };
}

function percent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
