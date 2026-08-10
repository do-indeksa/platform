import { ArrowRight, BookOpenCheck, ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function HistoryEmpty({ kind }: { kind: "tasks" | "variants" }) {
  const t = useTranslations("history");
  const taskHistory = kind === "tasks";
  const Icon = taskHistory ? ClipboardList : BookOpenCheck;
  const href = taskHistory ? "/tasks" : "/simulation";

  return (
    <section className="border-y border-line py-10 text-center sm:py-14">
      <Icon aria-hidden className="mx-auto h-8 w-8 text-brand" />
      <h2 className="mt-4 text-xl font-bold">{t(`${kind}EmptyTitle`)}</h2>
      <p className="mx-auto mt-2 max-w-md leading-7 text-muted">
        {t(`${kind}EmptyDescription`)}
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand transition-colors hover:bg-brand-ink"
      >
        {t(taskHistory ? "startPractice" : "startMock")}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    </section>
  );
}
