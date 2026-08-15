"use client";

import { ChevronLeft, Play, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/user-provider";
import { Link, useRouter } from "@/i18n/navigation";
import { TRAINING_BUILDER_PATH } from "@/lib/app-routes";
import { useAttemptJournal, useAttempts } from "@/lib/attempts-store";
import { taskPracticeHref } from "@/lib/task-bank";
import {
  buildTrainingSet,
  createDefaultTrainingBuilderDraft,
  mergeTrainingBuilderAttempts,
  replaceTrainingPositions,
  setTrainingPositionQuantity,
  type TrainingBuilderDifficulty,
} from "@/lib/training-builder";
import {
  TrainingPositionsStep,
  type TrainingBuilderPreset,
} from "./training-positions-step";
import { TrainingSettings } from "./training-settings";
import { TrainingSubjectStep } from "./training-subject-step";
import { TrainingSummary } from "./training-summary";
import type {
  TrainingBuilderPositionView,
  TrainingBuilderTaskView,
} from "./types";
import { useTrainingBuilderDraft } from "./use-training-builder-draft";

const EMPTY_ATTEMPTS: never[] = [];

export function TrainingBuilder({
  blueprintVersion,
  positions,
  tasks,
}: {
  blueprintVersion: string;
  positions: TrainingBuilderPositionView[];
  tasks: TrainingBuilderTaskView[];
}) {
  const t = useTranslations("trainingBuilder");
  const router = useRouter();
  const { user, loading: ownerLoading } = useUser();
  const ownerId = ownerLoading ? undefined : (user?.id ?? null);
  const journal = useAttemptJournal();
  const legacyAttempts = useAttempts();
  const {
    draft,
    status: draftStatus,
    ready: draftReady,
    commit: commitDraft,
    save: saveDraft,
  } = useTrainingBuilderDraft(ownerId, positions, blueprintVersion);
  const [showAllPositions, setShowAllPositions] = useState(false);
  const visibleShowAllPositions = draftReady && showAllPositions;

  useEffect(() => {
    if (draftReady) return;
    const timeout = window.setTimeout(() => setShowAllPositions(false));
    return () => window.clearTimeout(timeout);
  }, [draftReady]);

  const attempts = useMemo(
    () =>
      draftReady && journal
        ? mergeTrainingBuilderAttempts(journal.entries, legacyAttempts ?? [])
        : EMPTY_ATTEMPTS,
    [draftReady, journal, legacyAttempts],
  );
  const preview = useMemo(
    () =>
      buildTrainingSet({
        draft,
        positions,
        tasks,
        attempts,
        seed: `${blueprintVersion}:${JSON.stringify(draft)}`,
      }),
    [attempts, blueprintVersion, draft, positions, tasks],
  );
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task] as const)),
    [tasks],
  );
  const latestByTask = useMemo(() => {
    const latest = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      const current = latest.get(attempt.taskId);
      if (
        !current ||
        Date.parse(attempt.submittedAt) >= Date.parse(current.submittedAt)
      ) {
        latest.set(attempt.taskId, attempt);
      }
    }
    return latest;
  }, [attempts]);

  const reset = () => {
    commitDraft(createDefaultTrainingBuilderDraft(positions, blueprintVersion));
    setShowAllPositions(false);
  };
  const start = () => {
    if (!draftReady || !journal) return;
    const practiceId = crypto.randomUUID();
    const selection = buildTrainingSet({
      draft,
      positions,
      tasks,
      attempts,
      seed: practiceId,
    });
    const firstTask = taskById.get(selection.taskIds[0]);
    if (!firstTask) return;
    router.push(
      taskPracticeHref(
        firstTask,
        TRAINING_BUILDER_PATH,
        selection.taskIds,
        practiceId,
      ),
    );
  };

  const selectPreset = (preset: TrainingBuilderPreset) => {
    const selectedNumbers = positions.flatMap((position) => {
      const positionTasks = tasks.filter(({ topic }) =>
        position.topicSlugs.includes(topic),
      );
      if (preset === "all") return [position.number];
      if (
        preset === "new" &&
        positionTasks.some(({ id }) => !latestByTask.has(id))
      ) {
        return [position.number];
      }
      if (
        preset === "mistakes" &&
        positionTasks.some(({ id }) => {
          const outcome = latestByTask.get(id)?.outcome;
          return outcome === "INCORRECT" || outcome === "PARTIAL";
        })
      ) {
        return [position.number];
      }
      return [];
    });
    commitDraft(
      replaceTrainingPositions(
        {
          ...draft,
          onlyNew: preset === "new",
          prioritizeMistakes: preset === "mistakes",
        },
        positions,
        selectedNumbers,
      ),
    );
    if (selectedNumbers.some((number) => number > 8)) setShowAllPositions(true);
  };

  const selectedTotal = Object.values(draft.quantities).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const journalStatus = journal?.status ?? "loading";
  const canStart = draftReady && journal !== null && preview.taskIds.length > 0;

  return (
    <main
      data-testid="training-builder"
      data-draft-state={draftReady ? "ready" : "loading"}
      aria-busy={!draftReady}
      className="min-h-[calc(100vh-64px)] overflow-hidden rounded-b-2xl bg-page xl:min-h-[calc(100vh-72px)]"
    >
      <div className="mx-auto flex w-[calc(100%_-_32px)] max-w-[1240px] flex-col gap-4 pt-3.5 pb-5 md:w-[calc(100%_-_104px)] md:pt-6 xl:w-[1240px]">
        <Link
          href="/tasks"
          className="inline-flex min-h-5 w-fit items-center gap-1 text-sm leading-5 text-brand-ink"
        >
          <ChevronLeft aria-hidden size={16} strokeWidth={1.7} />
          {t("back")}
        </Link>

        <div className="flex h-[58px] min-w-0 items-start justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] leading-[30px] font-semibold text-ink xl:text-[32px] xl:leading-10 xl:font-bold">
              {t("title")}
            </h1>
            <p className="truncate text-sm leading-5 text-muted">
              {t("description")}
            </p>
          </div>
          <button
            type="button"
            onClick={saveDraft}
            disabled={!draftReady}
            aria-label={t("saveDraft")}
            title={t("saveDraft")}
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-2 text-sm leading-5 text-muted hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40 md:px-3"
          >
            <Save aria-hidden size={15} strokeWidth={1.6} />
            <span className="hidden xl:inline">{t("saveDraft")}</span>
          </button>
        </div>

        <div className="grid items-start gap-7 xl:grid-cols-[840px_372px]">
          <div className="grid min-w-0 gap-3.5">
            <TrainingSubjectStep blueprintVersion={blueprintVersion} />
            <TrainingPositionsStep
              positions={positions}
              quantities={draft.quantities}
              selectedTotal={selectedTotal}
              showAllPositions={visibleShowAllPositions}
              disabled={!draftReady}
              journalReady={draftReady && journal !== null}
              onPresetSelect={selectPreset}
              onReset={reset}
              onShowAllPositionsChange={setShowAllPositions}
              onQuantityChange={(position, quantity) =>
                commitDraft(
                  setTrainingPositionQuantity(draft, position, quantity),
                )
              }
            />
          </div>

          <aside className="grid min-w-0 gap-3.5">
            <TrainingSummary
              positions={positions}
              quantities={draft.quantities}
              actualCounts={preview.counts}
              total={preview.taskIds.length}
              disabled={!draftReady}
              onRemove={(position) =>
                commitDraft(setTrainingPositionQuantity(draft, position, 0))
              }
            />
            <TrainingSettings
              difficulty={draft.difficulty}
              onlyNew={draft.onlyNew}
              shuffle={draft.shuffle}
              prioritizeMistakes={draft.prioritizeMistakes}
              disabled={!draftReady}
              journalStatus={journalStatus}
              onDifficultyChange={(difficulty: TrainingBuilderDifficulty) =>
                commitDraft({ ...draft, difficulty })
              }
              onOnlyNewChange={(onlyNew) => commitDraft({ ...draft, onlyNew })}
              onShuffleChange={(shuffle) => commitDraft({ ...draft, shuffle })}
              onPrioritizeMistakesChange={(prioritizeMistakes) =>
                commitDraft({ ...draft, prioritizeMistakes })
              }
            />

            <button
              type="button"
              disabled={!canStart}
              onClick={start}
              aria-label={
                journal === null
                  ? t("preparing")
                  : preview.taskIds.length === 0
                    ? t("noMatching")
                    : t("startLabel", { count: preview.taskIds.length })
              }
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-3 text-sm leading-5 font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            >
              <Play
                aria-hidden
                size={15}
                fill="currentColor"
                strokeWidth={1.5}
              />
              {journal === null
                ? t("preparing")
                : preview.taskIds.length === 0
                  ? t("noMatching")
                  : t("start")}
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draftReady}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-sm leading-5 font-semibold text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save aria-hidden size={15} strokeWidth={1.6} />
              {draftStatus === "saved"
                ? t("saved")
                : draftStatus === "restored"
                  ? t("restored")
                  : draftStatus === "error"
                    ? t("saveFailed")
                    : t("saveLocal")}
            </button>
            <p className="sr-only" role="status" aria-live="polite">
              {draftStatus === "saved"
                ? t("saved")
                : draftStatus === "restored"
                  ? t("restored")
                  : draftStatus === "error"
                    ? t("saveFailed")
                    : t("selectedCount", { count: selectedTotal })}
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
