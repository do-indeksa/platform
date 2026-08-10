import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  OVERVIEW_TASK_COUNTS,
  selectOverviewTaskIds,
  type OverviewDifficulty,
  type OverviewPosition,
  type OverviewTask,
} from "@/lib/overview";
import type { MappedAttempt } from "@/lib/prep-readiness";
import { taskBankHref, taskPracticeHref } from "@/lib/task-bank";

const difficulties: OverviewDifficulty[] = [
  "all",
  "foundation",
  "exam",
  "advanced",
];

export function PracticeBuilder({
  positions,
  tasks,
  attempts,
}: {
  positions: OverviewPosition[];
  tasks: OverviewTask[];
  attempts: MappedAttempt[];
}) {
  const t = useTranslations("home.builder");
  const router = useRouter();
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<OverviewDifficulty>("all");
  const [count, setCount] = useState<number>(5);
  const selectedTaskIds = useMemo(
    () =>
      selectOverviewTaskIds({
        selectedPositions,
        difficulty,
        count,
        positions,
        tasks,
        attempts,
      }),
    [attempts, count, difficulty, positions, selectedPositions, tasks],
  );
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task] as const)),
    [tasks],
  );
  const selectedTopics = [
    ...new Set(
      positions
        .filter((position) => selectedPositions.includes(position.number))
        .flatMap((position) => position.topicSlugs),
    ),
  ];
  const returnTo = taskBankHref({
    query: "",
    positions: [],
    topics: selectedTopics,
    difficulties: difficulty === "all" ? [] : [difficulty],
    progress: "all",
    sort: "position",
  });
  const canStart = selectedTaskIds.length > 0;

  const start = () => {
    const firstTask = taskById.get(selectedTaskIds[0]);
    if (!firstTask) return;
    router.push(
      taskPracticeHref(
        firstTask,
        returnTo,
        selectedTaskIds,
        crypto.randomUUID(),
      ),
    );
  };

  return (
    <section
      aria-labelledby="practice-builder-title"
      className="border-y border-line bg-subtle px-5 py-5 sm:px-8 sm:py-8"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-brand-ink">{t("kicker")}</p>
          <h2
            id="practice-builder-title"
            className="mt-1 text-xl font-bold sm:text-2xl"
          >
            {t("title")}
          </h2>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">
            {t("positionsLegend")}
          </legend>
          <div className="mt-2.5 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {positions.map((position) => {
              const active = selectedPositions.includes(position.number);
              return (
                <button
                  key={position.number}
                  type="button"
                  aria-pressed={active}
                  aria-label={t("positionOption", {
                    position: position.number,
                    topic: position.name,
                  })}
                  onClick={() =>
                    setSelectedPositions((current) =>
                      current.includes(position.number)
                        ? current.filter((value) => value !== position.number)
                        : [...current, position.number].toSorted(
                            (a, b) => a - b,
                          ),
                    )
                  }
                  className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    active
                      ? "border-brand bg-brand text-on-brand"
                      : "border-line bg-surface text-ink hover:border-brand hover:text-brand-ink"
                  }`}
                >
                  {position.number}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-semibold">
            {t("difficultyLabel")}
            <select
              value={difficulty}
              onChange={(event) =>
                setDifficulty(event.target.value as OverviewDifficulty)
              }
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {difficulties.map((value) => (
                <option key={value} value={value}>
                  {t(`difficulty.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t("countLabel")}
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {OVERVIEW_TASK_COUNTS.map((value) => (
                <option key={value} value={value}>
                  {t("countOption", { count: value })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!canStart}
            onClick={start}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 sm:min-w-48"
          >
            <Play aria-hidden className="h-4 w-4 fill-current" />
            {canStart
              ? t("startSet", { count: selectedTaskIds.length })
              : t("selectToStart")}
          </button>
        </div>
        {selectedPositions.length > 0 && !canStart && (
          <p role="status" className="mt-3 text-sm text-red-700">
            {t("noMatchingTasks")}
          </p>
        )}
      </div>
    </section>
  );
}
