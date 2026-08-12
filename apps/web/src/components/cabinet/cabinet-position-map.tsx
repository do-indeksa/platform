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
      className="flex h-[602px] flex-col rounded-[20px] border border-line bg-surface p-4 md:h-[378px] md:p-7 xl:h-[292px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="cabinet-position-title"
            className="text-xl leading-7 font-bold md:text-2xl md:leading-8"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-muted md:text-sm">{t("intro")}</p>
        </div>
        <Link
          href="/prep"
          className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-brand hover:underline md:inline-flex"
        >
          {t("how")}
          <Info aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Link
        href="/prep"
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline md:hidden"
      >
        {t("how")}
        <Info aria-hidden className="h-3.5 w-3.5" />
      </Link>

      <div className="mt-4 grid grid-cols-5 gap-x-2 gap-y-3 md:mt-5 md:gap-x-3 md:gap-y-4 xl:grid-cols-10">
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
        className="mt-auto flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between"
      >
        <div className="flex flex-col gap-2 text-muted md:flex-row md:gap-8 xl:gap-16">
          <Legend color="bg-[#159a78]" label={t("legend.confident")} />
          <Legend color="bg-[#b76d00]" label={t("legend.review")} />
          <Legend color="bg-[#697083]" label={t("legend.learn")} />
        </div>
        <Link
          href="/prep"
          className="inline-flex items-center gap-2 font-medium text-brand hover:underline"
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
      className={`flex min-w-0 flex-col items-center rounded-xl px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:min-h-[88px] xl:min-h-[116px] xl:justify-center ${
        active
          ? "border border-line bg-surface shadow-[0_2px_8px_rgba(25,20,60,0.04)]"
          : "border border-transparent"
      }`}
    >
      <span
        className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl text-base font-bold md:h-[54px] md:w-[54px] md:text-xl ${tone.tile}`}
      >
        {position.number}
      </span>
      <span
        className={`mt-2 w-full text-[10px] leading-3 md:text-[11px] md:leading-4 ${tone.text}`}
      >
        {t(`status.${status}`)}
      </span>
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${color}`} />
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
      return { tile: "bg-[#e8f7ef] text-[#138b64]", text: "text-[#138b64]" };
    case "needsWork":
      return { tile: "bg-[#fff6e5] text-[#b76d00]", text: "text-[#8d5909]" };
    case "starting":
    case "progressing":
      return { tile: "bg-subtle text-brand-ink", text: "text-muted" };
    case "untested":
      return { tile: "bg-subtle text-ink", text: "text-muted" };
  }
}
