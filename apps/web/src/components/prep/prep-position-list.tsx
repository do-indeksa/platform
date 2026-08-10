"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { PROGRESS_STATUS_STYLES } from "@/components/progress-status";
import { Link } from "@/i18n/navigation";
import type { PrepPositionProgress } from "@/lib/prep-plan";

export function PrepPositionList({
  positions,
}: {
  positions: PrepPositionProgress[];
}) {
  const t = useTranslations("prep");

  return (
    <section className="mt-12" aria-labelledby="position-progress-title">
      <div className="max-w-2xl">
        <h2 id="position-progress-title" className="text-2xl font-bold">
          {t("positionProgressTitle")}
        </h2>
        <p className="mt-2 leading-7 text-muted">
          {t("positionProgressIntro")}
        </p>
      </div>
      <ol className="mt-6 grid border-t border-line lg:grid-cols-2 lg:gap-x-10">
        {positions.map((position) => (
          <PositionRow key={position.number} position={position} />
        ))}
      </ol>
    </section>
  );
}

function PositionRow({ position }: { position: PrepPositionProgress }) {
  const t = useTranslations("prep");
  const styles = PROGRESS_STATUS_STYLES[position.status];
  const query = new URLSearchParams();
  for (const topic of position.topicSlugs) query.append("topic", topic);
  const href = `/tasks?${query}`;

  return (
    <li className="border-b border-line py-4">
      <Link
        href={href}
        className="group grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold ${styles.number}`}
        >
          {position.number}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-5 group-hover:text-brand-ink">
            {position.name}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            {position.total === 0
              ? t("positionNoEvidence")
              : t("positionEvidence", {
                  correct: position.correct,
                  total: position.total,
                })}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5"
        />
        <span className="col-start-2 col-end-4 flex min-w-0 items-center gap-3">
          <span
            role="progressbar"
            aria-label={t("positionProgressAria", {
              position: position.number,
            })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={position.readiness}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100"
          >
            <span
              className={`block h-full rounded-full ${styles.bar}`}
              style={{ width: `${position.readiness}%` }}
            />
          </span>
          <span className="w-9 text-right text-xs font-semibold tabular-nums text-muted">
            {position.readiness}%
          </span>
          <span
            className={`hidden rounded-md px-2 py-1 text-xs font-medium sm:inline ${styles.badge}`}
          >
            {t(`positionStatus.${position.status}`)}
          </span>
        </span>
      </Link>
    </li>
  );
}
