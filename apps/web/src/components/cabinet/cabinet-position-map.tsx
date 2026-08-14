"use client";

import { ArrowRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CabinetPositionProgress } from "./cabinet-model";

export function CabinetPositionMap({
  positions,
  activePosition,
  pending,
}: {
  positions: readonly CabinetPositionProgress[];
  activePosition: number | null;
  pending: boolean;
}) {
  const t = useTranslations("cabinet.positions");

  return (
    <section
      data-testid="cabinet-position-map"
      aria-labelledby="cabinet-position-title"
      aria-busy={pending}
      className="flex h-[602px] flex-col items-start gap-[18px] overflow-hidden rounded-[20px] border border-line bg-surface p-6 md:h-[378px] md:p-7 xl:h-[292px]"
    >
      <div className="flex h-[78px] w-full flex-col justify-between md:h-[54px] md:flex-row md:items-start">
        <div>
          <h2
            id="cabinet-position-title"
            className="text-[22px] leading-[1.4] font-semibold"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-[13px] leading-[1.4] text-muted">
            {t("intro")}
          </p>
        </div>
        <Link
          href="/prep"
          className="inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-[1.4] font-medium text-brand-ink hover:underline"
        >
          {t("how")}
          <Info aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid h-[344px] w-full grid-cols-5 content-start gap-x-2 gap-y-3 md:h-[228px] md:gap-x-3 md:gap-y-5 min-[1024px]:grid-cols-[repeat(6,128px)] xl:h-[116px] xl:grid-cols-[repeat(10,112px)] xl:gap-y-0">
        {positions.map((position) => (
          <PositionLink
            key={position.number}
            position={position}
            active={position.number === activePosition}
            pending={pending}
          />
        ))}
      </div>

      <div
        id="cabinet-position-legend"
        className="flex h-[112px] w-full flex-col gap-1.5 text-xs leading-[1.4] md:h-[18px] md:max-w-[808px] md:flex-row md:items-start md:gap-6 xl:max-w-[1186px]"
      >
        <div className="flex flex-col gap-1.5 md:flex-row md:gap-6">
          <Legend
            className="text-success md:w-[130px]"
            label={t("legend.confident")}
          />
          <Legend
            className="text-warning md:w-[120px]"
            label={t("legend.review")}
          />
          <Legend
            className="text-muted md:w-[160px]"
            label={t("legend.learn")}
          />
        </div>
        <Link
          href="/prep"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-ink hover:underline md:ml-auto md:w-[210px]"
        >
          {t("openPlan")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function PositionLink({
  position,
  active,
  pending,
}: {
  position: CabinetPositionProgress;
  active: boolean;
  pending: boolean;
}) {
  const t = useTranslations("cabinet.positions");
  const status = pending ? "untested" : position.status;
  const tone = positionTone(status);

  return (
    <Link
      href={`/tasks?position=${position.number}`}
      aria-label={t("openPosition", {
        position: position.number,
        topic: position.name,
      })}
      className={`flex h-[100px] min-w-0 flex-col items-center gap-1.5 rounded-[14px] border pt-2.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:h-[104px] md:gap-2 xl:h-[116px] ${
        active ? "border-line bg-surface" : "border-transparent"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-xl leading-[1.4] font-semibold md:h-[54px] md:w-[54px] ${tone.tile}`}
      >
        {position.number}
      </span>
      <span className={`w-full text-[11px] leading-[1.4] ${tone.text}`}>
        {t(`status.${status}`)}
      </span>
    </Link>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function positionTone(status: CabinetPositionProgress["status"]): {
  tile: string;
  text: string;
} {
  switch (status) {
    case "confident":
      return { tile: "bg-success-subtle text-success", text: "text-muted" };
    case "needsWork":
      return { tile: "bg-warning-subtle text-warning", text: "text-muted" };
    case "starting":
    case "progressing":
      return { tile: "bg-subtle text-brand-ink", text: "text-muted" };
    case "untested":
      return { tile: "bg-subtle text-ink", text: "text-muted" };
  }
}
