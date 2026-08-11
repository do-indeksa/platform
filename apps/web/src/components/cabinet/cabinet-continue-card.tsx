"use client";

import { BookOpen, Clock, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { taskPracticeHref } from "@/lib/task-bank";
import type { OverviewExam } from "@/lib/overview";
import type { CabinetPractice, CabinetTask } from "./cabinet-model";
import { CabinetLinkButton } from "./cabinet-link-button";
import type { CabinetResume } from "./use-cabinet-resume";

type ContinueCardProps = {
  exam: OverviewExam;
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
    resume === null || resume.kind === "mock" ? "figma" : "provisional";

  return (
    <section
      data-testid="continue-run"
      data-design-status={exact}
      className="relative flex h-[642px] flex-col overflow-hidden rounded-[20px] bg-subtle p-6 md:h-[322px] md:flex-row md:p-8"
      aria-labelledby="cabinet-continue-title"
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col md:max-w-[520px] xl:max-w-[560px]">
        <p className="text-xs font-semibold text-brand uppercase">
          {content.kicker}
        </p>
        <h2
          id="cabinet-continue-title"
          className="mt-4 text-[30px] leading-10 font-bold md:text-[30px] md:leading-9"
        >
          {content.title}
        </h2>
        <p className="mt-3 text-sm leading-5 md:text-base">
          {content.description}
        </p>

        <div className="mt-4 flex max-w-[515px] items-center gap-4">
          <div
            role="progressbar"
            aria-label={t("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={content.progress}
            className="h-1 flex-1 overflow-hidden rounded-full bg-[#e7f8f3]"
          >
            <div
              className="h-full rounded-full bg-[#159a78]"
              style={{ width: `${content.progress}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm font-bold">
            {content.progress}%
          </span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {content.meta.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex min-h-9 items-center gap-2 rounded-[10px] bg-surface px-3 text-xs text-muted md:text-sm"
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[180px_230px]">
          <CabinetLinkButton href={content.primaryHref} variant="primary">
            {content.primaryLabel}
          </CabinetLinkButton>
          <CabinetLinkButton href={content.secondaryHref}>
            {content.secondaryLabel}
          </CabinetLinkButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-end justify-center pt-5 md:absolute md:inset-y-0 md:right-8 md:w-[360px] md:items-center md:pt-0 xl:right-14 xl:w-[380px]">
        <Image
          src="/cabinet/preparation-book.png"
          alt=""
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 767px) 260px, 360px"
          className="h-auto w-[260px] object-contain md:w-[330px] xl:w-[360px]"
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
