import { ArrowLeft, ExternalLink, Info, University } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { getFtnCatalog } from "@/lib/guide";
import { ftnExamCodes } from "@/lib/guide-types";
import { routing } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; examId: string }>;
};

export function generateStaticParams() {
  return ftnExamCodes.slice(1).map((code) => ({
    examId: `ftn-${code.toLowerCase()}`,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, examId } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [catalog, t] = await Promise.all([
    getFtnCatalog(),
    getTranslations({ locale, namespace: "examCatalog" }),
  ]);
  const exam = catalog.exams.find((item) => item.id === examId);
  if (!exam) return {};
  return {
    title: t("detailMetadataTitle", {
      code: exam.code,
      name: t(`names.${exam.code}`),
    }),
    description: t("detailMetadataDescription", { code: exam.code }),
  };
}

export default async function ExamDetailPage({ params }: Props) {
  const { locale, examId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [catalog, t] = await Promise.all([
    getFtnCatalog(),
    getTranslations({ locale, namespace: "examCatalog" }),
  ]);
  const exam = catalog.exams.find((item) => item.id === examId);
  if (!exam) notFound();
  if (exam.status === "available") redirect({ href: "/", locale });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-11 lg:px-8">
      <Link
        href="/exams"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-brand-ink"
      >
        <ArrowLeft aria-hidden size={17} />
        {t("backToCatalog")}
      </Link>

      <header className="mt-4 border-b border-line pb-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-sm font-bold text-brand-ink">
            {exam.code}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
            {t("status.planned")}
          </span>
        </div>
        <h1 className="mt-5 text-[2rem] leading-10 font-bold text-ink sm:text-4xl sm:leading-[2.8rem]">
          {t(`names.${exam.code}`)}
        </h1>
        <p className="mt-2 text-sm font-medium text-muted">
          {exam.officialName} · FTN Novi Sad
        </p>
      </header>

      <section className="mt-7 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <Info aria-hidden size={20} className="mt-0.5 shrink-0" />
        <div>
          <h2 className="font-bold">{t("plannedTitle")}</h2>
          <p className="mt-1">{t("plannedDescription", { code: exam.code })}</p>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="programs-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.08em] text-brand-ink uppercase">
              {t("facultyContext")}
            </p>
            <h2
              id="programs-title"
              className="mt-1 text-2xl font-bold text-ink"
            >
              {t("allPrograms", { count: exam.programs.length })}
            </h2>
          </div>
          <Link
            href="/faculties/ftn"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-ink hover:underline"
          >
            <University aria-hidden size={17} />
            {t("openFaculty")}
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {exam.programs.map((program) => (
            <li
              key={program}
              className="flex min-h-14 items-center py-3 text-sm font-medium text-ink"
            >
              {program}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-9 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted">
          {t("verifiedAt", { date: catalog.retrievedAt })}
        </p>
        <a
          href={catalog.source}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-ink hover:underline"
        >
          {t("officialExamSource")}
          <ExternalLink aria-hidden size={16} />
        </a>
      </footer>
    </main>
  );
}
