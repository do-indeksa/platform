"use client";

import { RotateCcw, Search, University } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { examCatalogHref, filterFtnExams } from "@/lib/exam-catalog";
import {
  ftnExamCodes,
  type FtnCatalog,
  type FtnExamCode,
} from "@/lib/guide-types";
import { ExamCard } from "./exam-card";

type ExamCatalogProps = {
  catalog: FtnCatalog;
  initialQuery: string;
};

export function ExamCatalog({ catalog, initialQuery }: ExamCatalogProps) {
  const t = useTranslations("examCatalog");
  const [query, setQuery] = useState(initialQuery);
  const localizedNames = useMemo(
    () =>
      Object.fromEntries(
        ftnExamCodes.map((code) => [code, t(`names.${code}`)]),
      ) as Record<FtnExamCode, string>,
    [t],
  );
  const exams = useMemo(
    () => filterFtnExams(catalog, localizedNames, query),
    [catalog, localizedNames, query],
  );

  const commitQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    window.history.replaceState(
      null,
      "",
      examCatalogHref(nextQuery).replace("/exams", window.location.pathname),
    );
  };

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-11 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.08em] text-brand-ink uppercase">
          {t("kicker")}
        </p>
        <h1 className="mt-2 text-[2rem] leading-10 font-bold text-ink sm:text-4xl sm:leading-[2.8rem]">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          {t("intro")}
        </p>
      </header>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search
            aria-hidden
            size={19}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            maxLength={120}
            onChange={(event) => commitQuery(event.currentTarget.value)}
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-lg border border-line bg-surface pr-4 pl-11 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <Link
          href="/faculties/ftn"
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand-ink"
        >
          <University aria-hidden size={18} />
          {t("openFaculty")}
        </Link>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p aria-live="polite" className="text-sm font-medium text-muted">
          {t("resultCount", { count: exams.length })}
        </p>
        {query.trim() && (
          <button
            type="button"
            onClick={() => commitQuery("")}
            className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-brand-ink hover:underline"
          >
            <RotateCcw aria-hidden size={16} />
            {t("reset")}
          </button>
        )}
      </div>

      {exams.length ? (
        <div className="mt-3 grid gap-3">
          {exams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} query={query} />
          ))}
        </div>
      ) : (
        <section className="py-16 text-center" aria-labelledby="empty-title">
          <Search aria-hidden size={30} className="mx-auto text-muted" />
          <h2 id="empty-title" className="mt-4 text-xl font-bold text-ink">
            {t("emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {t("emptyDescription", { query: query.trim() })}
          </p>
          <button
            type="button"
            onClick={() => commitQuery("")}
            className="mt-5 min-h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            {t("showAll")}
          </button>
        </section>
      )}

      <footer className="mt-9 border-t border-line pt-5 text-xs leading-5 text-muted">
        {t.rich("sourceNote", {
          source: (chunks) => (
            <a
              href={catalog.source}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-ink underline underline-offset-4"
            >
              {chunks}
            </a>
          ),
          date: catalog.retrievedAt,
        })}
      </footer>
    </main>
  );
}
