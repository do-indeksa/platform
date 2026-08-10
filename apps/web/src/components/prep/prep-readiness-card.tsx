"use client";

import { ArrowRight, CircleGauge, Info, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";

export function ReadinessCard({
  readiness,
  covered,
  total,
}: {
  readiness: number;
  covered: number;
  total: number;
}) {
  const t = useTranslations("prep");

  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CircleGauge aria-hidden className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold">{t("readinessTitle")}</h2>
            <span className="group relative">
              <button
                type="button"
                aria-label={t("readinessMethod", { total })}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Info aria-hidden className="h-4 w-4" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-9 right-0 z-10 hidden w-64 rounded-lg bg-ink p-3 text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus-within:block"
              >
                {t("readinessMethod", { total })}
              </span>
            </span>
          </div>
          <p className="mt-4 text-4xl font-bold tabular-nums">{readiness}%</p>
        </div>
        <span className="rounded-lg bg-subtle px-2.5 py-1.5 text-xs font-semibold text-brand-ink">
          {t("coverageCompact", { covered, total })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("readinessTitle")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readiness}
        className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100"
      >
        <div
          className="h-full rounded-full bg-cyan-500 transition-[width]"
          style={{ width: `${readiness}%` }}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        {t("readinessDisclaimer")}
      </p>
    </section>
  );
}

export function GuestOffer({ pathname }: { pathname: string }) {
  const t = useTranslations("prep");

  return (
    <section className="border-t border-line pt-6">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-brand-ink">
          <LogIn aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t("guestTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t("guestDescription")}
          </p>
          <a
            href={`/api/v1/auth/google?redirect=${encodeURIComponent(pathname)}`}
            className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-ink hover:underline"
          >
            {t("guestCta")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
