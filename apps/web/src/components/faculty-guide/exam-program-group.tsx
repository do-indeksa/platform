import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FtnExam } from "@/lib/guide-types";

export function ExamProgramGroup({ exam }: { exam: FtnExam }) {
  const t = useTranslations("facultyGuide");
  const examT = useTranslations("examCatalog");
  const available = exam.status === "available";

  return (
    <section aria-labelledby={`${exam.id}-title`}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line pb-3">
        <span className="rounded-full bg-subtle px-3 py-1.5 text-xs font-bold text-brand-ink">
          {exam.code}
        </span>
        <h3 id={`${exam.id}-title`} className="text-lg font-bold text-ink">
          {examT(`names.${exam.code}`)}
        </h3>
        <span
          className={`text-xs font-semibold ${available ? "text-emerald-700" : "text-amber-800"}`}
        >
          {examT(`status.${exam.status}`)}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {exam.programs.map((program) => (
          <li
            key={program}
            className="grid min-h-16 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <p className="text-sm font-semibold text-ink">{program}</p>
            <Link
              href={available ? "/" : `/exams/${exam.id}`}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors sm:w-auto ${
                available
                  ? "bg-brand text-on-brand hover:bg-brand-hover"
                  : "border border-line bg-surface text-ink hover:border-brand hover:text-brand-ink"
              }`}
            >
              {available ? t("prepare") : t("examDetails")}
              <ArrowRight aria-hidden size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
