import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { PROGRESS_STATUS_STYLES } from "@/components/progress-status";
import { Link } from "@/i18n/navigation";
import type { OverviewPositionProgress } from "@/lib/overview";
import { taskBankHref } from "@/lib/task-bank";

export function PositionOverview({
  positions,
  pending,
}: {
  positions: OverviewPositionProgress[];
  pending: boolean;
}) {
  const t = useTranslations("home.positions");
  const prepT = useTranslations("prep");

  return (
    <section
      aria-labelledby="positions-title"
      className="px-5 py-10 sm:px-8 sm:py-14"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-2xl">
          <h2 id="positions-title" className="text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted sm:text-base sm:leading-7">
            {t("intro")}
          </p>
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {positions.map((position) => {
            const styles = PROGRESS_STATUS_STYLES[position.status];
            const href = taskBankHref({
              query: "",
              positions: [],
              topics: position.topicSlugs,
              difficulties: [],
              progress: "all",
              sort: "position",
            });
            return (
              <li key={position.number}>
                <Link
                  href={href}
                  aria-label={t("openPosition", {
                    position: position.number,
                    topic: position.name,
                  })}
                  className="group flex min-h-44 h-full min-w-0 flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${styles.number}`}
                    >
                      {position.number}
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold leading-5 group-hover:text-brand-ink">
                    {position.name}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {t("taskCount", { count: position.taskCount })}
                  </p>
                  <span className="mt-auto pt-4">
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`rounded-md px-2 py-1 font-medium ${pending ? "bg-zinc-100 text-zinc-600" : styles.badge}`}
                      >
                        {pending
                          ? t("loadingProgress")
                          : prepT(`positionStatus.${position.status}`)}
                      </span>
                      {!pending && (
                        <span className="font-semibold tabular-nums text-muted">
                          {position.readiness}%
                        </span>
                      )}
                    </span>
                    <span
                      role="progressbar"
                      aria-label={t("progressAria", {
                        position: position.number,
                      })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pending ? undefined : position.readiness}
                      aria-busy={pending}
                      className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-100"
                    >
                      <span
                        className={`block h-full rounded-full ${pending ? "bg-zinc-200" : styles.bar}`}
                        style={{
                          width: `${pending ? 0 : position.readiness}%`,
                        }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
