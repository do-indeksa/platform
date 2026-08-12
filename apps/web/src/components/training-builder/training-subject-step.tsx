"use client";

import { useTranslations } from "next-intl";
import { TrainingStepHeading } from "./training-step-heading";

export function TrainingSubjectStep({
  blueprintVersion,
}: {
  blueprintVersion: string;
}) {
  const t = useTranslations("trainingBuilder");

  return (
    <section
      aria-labelledby="training-subject-title"
      className="h-[180px] overflow-hidden rounded-[14px] border border-line bg-surface p-4 md:h-[120px]"
    >
      <TrainingStepHeading id="training-subject-title" step={1}>
        {t("subjectStep")}
      </TrainingStepHeading>
      <div className="mt-3.5 grid gap-2.5 md:grid-cols-[210px_190px]">
        <span className="flex h-11 items-center justify-center rounded-[10px] border border-line bg-surface px-3 text-sm leading-5 font-semibold text-ink">
          {t("p1")} <span className="ml-3 text-brand-ink">✓</span>
        </span>
        <span className="flex h-11 items-center justify-center rounded-[10px] border border-line bg-page px-3 text-sm leading-5 font-semibold text-muted">
          {t("onlyP1", { version: blueprintVersion })}
        </span>
      </div>
    </section>
  );
}
