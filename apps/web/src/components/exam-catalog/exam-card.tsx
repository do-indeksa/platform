import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { matchingFtnPrograms } from "@/lib/exam-catalog";
import type { FtnExam } from "@/lib/guide-types";

type ExamCardProps = {
  exam: FtnExam;
  query: string;
};

export function ExamCard({ exam, query }: ExamCardProps) {
  const t = useTranslations("examCatalog");
  const matchedPrograms = matchingFtnPrograms(exam, query);
  const visiblePrograms = matchedPrograms.length
    ? matchedPrograms
    : exam.programs.slice(0, 3);
  const hiddenCount = exam.programs.length - visiblePrograms.length;
  const available = exam.status === "available";

  return (
    <article className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-bold text-brand-ink">
            {exam.code}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base leading-6 font-bold text-ink">
              {t(`names.${exam.code}`)}
            </h2>
            <Link
              href="/faculties/ftn"
              className="inline-flex min-h-11 items-center text-xs font-medium text-muted underline-offset-4 hover:text-brand-ink hover:underline"
            >
              FTN · Novi Sad
            </Link>
            <span
              className={`mt-2 flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                available
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              {available ? (
                <CheckCircle2 aria-hidden size={14} />
              ) : (
                <Clock3 aria-hidden size={14} />
              )}
              {t(`status.${exam.status}`)}
            </span>
          </div>
        </div>

        <div className="min-w-0 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <p className="text-xs font-semibold text-muted">
            {matchedPrograms.length
              ? t("matchingPrograms")
              : t("programs", { count: exam.programs.length })}
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm leading-5 text-ink sm:grid-cols-2">
            {visiblePrograms.map((program) => (
              <li key={program} className="flex min-w-0 gap-2">
                <span
                  aria-hidden
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand"
                />
                <span>{program}</span>
              </li>
            ))}
          </ul>
          {!matchedPrograms.length && hiddenCount > 0 && (
            <p className="mt-2 text-xs font-medium text-muted">
              {t("morePrograms", { count: hiddenCount })}
            </p>
          )}
        </div>

        <Link
          href={available ? "/" : `/exams/${exam.id}`}
          className={`flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors lg:w-auto ${
            available
              ? "bg-brand text-on-brand hover:bg-brand-hover"
              : "border border-line bg-surface text-ink hover:border-brand hover:text-brand-ink"
          }`}
        >
          {available ? t("openP1") : t("details")}
          <ArrowRight aria-hidden size={17} />
        </Link>
      </div>
    </article>
  );
}
