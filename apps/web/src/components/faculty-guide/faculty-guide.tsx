import {
  ArrowRight,
  Calculator,
  ExternalLink,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FtnCatalog } from "@/lib/guide-types";
import { ExamProgramGroup } from "./exam-program-group";

export function FacultyGuide({ catalog }: { catalog: FtnCatalog }) {
  const t = useTranslations("facultyGuide");
  const { faculty } = catalog;
  const programCount = catalog.exams.reduce(
    (total, exam) => total + exam.programs.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 sm:py-11 lg:px-8">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.08em] text-brand-ink uppercase">
          {faculty.university}
        </p>
        <h1 className="mt-2 text-[2rem] leading-10 font-bold text-ink sm:text-4xl sm:leading-[2.8rem]">
          {faculty.name}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-muted">
          <MapPin aria-hidden size={17} />
          {faculty.city}
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          {t("intro")}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/exams"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            {t("openCatalog")}
            <ArrowRight aria-hidden size={17} />
          </Link>
          <a
            href={faculty.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand-ink"
          >
            {t("officialWebsite")}
            <ExternalLink aria-hidden size={16} />
          </a>
        </div>
      </header>

      <section className="mt-9 flex gap-3 border-y border-line bg-page py-5 text-sm leading-6 text-muted">
        <ShieldCheck
          aria-hidden
          size={20}
          className="mt-0.5 shrink-0 text-brand-ink"
        />
        <div>
          <h2 className="font-bold text-ink">{t("importantTitle")}</h2>
          <p>{t("importantDescription")}</p>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="program-groups-title">
        <p className="text-xs font-bold tracking-[0.08em] text-brand-ink uppercase">
          {t("directoryKicker")}
        </p>
        <h2
          id="program-groups-title"
          className="mt-1 text-2xl font-bold text-ink"
        >
          {t("programGroupsTitle", {
            programs: programCount,
            exams: catalog.exams.length,
          })}
        </h2>
        <div className="mt-5 space-y-8">
          {catalog.exams.map((exam) => (
            <ExamProgramGroup key={exam.id} exam={exam} />
          ))}
        </div>
      </section>

      <section className="mt-10 bg-emphasis px-5 py-6 text-on-brand sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-7">
        <div>
          <h2 className="text-xl font-bold">{t("calculatorTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/75">
            {t("calculatorDescription")}
          </p>
        </div>
        <Link
          href="/calculator"
          className="mt-5 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-subtle sm:mt-0"
        >
          <Calculator aria-hidden size={17} />
          {t("openCalculator")}
        </Link>
      </section>

      <footer className="mt-8 flex flex-col gap-3 border-t border-line pt-5 text-xs leading-5 text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t("verifiedAt", { date: catalog.retrievedAt })}</p>
        <a
          href={faculty.programsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-ink hover:underline"
        >
          {t("officialPrograms")}
          <ExternalLink aria-hidden size={15} />
        </a>
      </footer>
    </main>
  );
}
