import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function P1Programs({
  programs,
  source,
}: {
  programs: string[];
  source: string;
}) {
  const t = useTranslations("home.programs");

  return (
    <section
      aria-labelledby="programs-title"
      className="px-5 py-10 sm:px-8 sm:py-14"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="programs-title" className="text-2xl font-bold sm:text-3xl">
              {t("title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base sm:leading-7">
              {t("intro", { count: programs.length })}
            </p>
          </div>
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-brand-ink hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("officialSource")}
            <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
        </div>

        <ul className="mt-6 grid border-t border-line md:grid-cols-2 md:gap-x-10">
          {programs.map((program) => (
            <li
              key={program}
              className="flex min-h-14 items-center gap-3 border-b border-line py-3 text-sm font-medium leading-5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-ink">
                <Check aria-hidden className="h-4 w-4" />
              </span>
              {program}
            </li>
          ))}
        </ul>
        <Link
          href="/calculator"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("calculatorCta")}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
