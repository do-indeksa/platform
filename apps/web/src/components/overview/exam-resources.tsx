import {
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  FileCheck2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OverviewExam } from "@/lib/overview";

export function ExamResources({ exam }: { exam: OverviewExam }) {
  const t = useTranslations("home.resources");

  return (
    <section
      aria-labelledby="resources-title"
      className="border-y border-line bg-surface px-5 py-10 sm:px-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-2xl">
          <h2 id="resources-title" className="text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted sm:text-base sm:leading-7">
            {t("intro")}
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <ResourceLink
            href="/simulation"
            icon={BookOpenCheck}
            title={t("mockTitle")}
            description={t("mockDescription", {
              tasks: exam.taskCount,
              minutes: exam.durationMinutes,
            })}
            meta={t("mockMeta", { version: exam.version })}
          />
          <ResourceLink
            href={exam.officialVariantUrl}
            icon={FileCheck2}
            title={t("officialTitle")}
            description={t("officialDescription")}
            meta={t("officialMeta", { version: exam.version })}
            external
          />
        </div>
      </div>
    </section>
  );
}

function ResourceLink({
  href,
  icon: Icon,
  title,
  description,
  meta,
  external = false,
}: {
  href: string;
  icon: typeof BookOpenCheck;
  title: string;
  description: string;
  meta: string;
  external?: boolean;
}) {
  const className =
    "group flex min-h-48 min-w-0 flex-col rounded-lg border border-line bg-page p-5 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  const content = (
    <>
      <span className="flex items-start justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-subtle text-brand-ink">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        {external ? (
          <ExternalLink aria-hidden className="h-4 w-4 text-muted" />
        ) : (
          <ArrowRight
            aria-hidden
            className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5"
          />
        )}
      </span>
      <h3 className="mt-4 font-bold group-hover:text-brand-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      <p className="mt-auto pt-4 text-xs font-semibold text-brand-ink">
        {meta}
      </p>
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
