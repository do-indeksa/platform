"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAttemptJournal, useAttempts } from "@/lib/attempts-store";
import { mergeTaskHistory } from "@/lib/history-journal";
import {
  buildPositionProgress,
  mapAttemptsToPositions,
} from "@/lib/prep-readiness";
import type { PrepTopicSlot } from "@/lib/prep-plan";
import type { ProgressCloudCatalog } from "@/lib/progress-cloud-types";
import {
  mergeSimulationArchive,
  type SimulationArchiveRun,
} from "@/lib/simulation-archive";
import { useSimulationArchive } from "@/lib/simulation-archive-store";
import { useSimulationHistory } from "@/lib/simulation-store";
import { useTaskHistory } from "@/lib/task-history-store";
import { useHydrated } from "@/lib/use-hydrated";
import {
  hasCabinetActivity,
  latestP1Mock,
  latestPracticeAttempt,
  selectCabinetPractice,
  type CabinetExam,
  type CabinetPosition,
  type CabinetTask,
} from "./cabinet-model";
import { CabinetContinueCard } from "./cabinet-continue-card";
import { CabinetLatestResults } from "./cabinet-latest-results";
import { CabinetPageHeader } from "./cabinet-page-header";
import { CabinetPositionMap } from "./cabinet-position-map";
import { CabinetPrograms } from "./cabinet-programs";
import { useCabinetResume } from "./use-cabinet-resume";

export function CabinetDashboard({
  exam,
  positions,
  tasks,
  topicSlots,
  programs,
  programSource,
  progressCatalog,
}: {
  exam: CabinetExam;
  positions: CabinetPosition[];
  tasks: CabinetTask[];
  topicSlots: PrepTopicSlot[];
  programs: string[];
  programSource: string;
  progressCatalog: ProgressCloudCatalog;
}) {
  const positionT = useTranslations("cabinet.positionNames");
  const hydrated = useHydrated();
  const attempts = useAttempts();
  const attemptJournal = useAttemptJournal();
  const taskHistory = useTaskHistory();
  const localSimulationHistory = useSimulationHistory();
  const simulationArchive = useSimulationArchive();
  const { ready: resumeReady, resume } = useCabinetResume(progressCatalog);

  const displayPositions = useMemo(
    () =>
      positions.map((position) => ({
        ...position,
        name: positionT(String(position.number)),
      })),
    [positionT, positions],
  );
  const mappedAttempts = useMemo(
    () =>
      mapAttemptsToPositions(
        attempts ?? [],
        displayPositions,
        topicSlots,
        tasks,
      ),
    [attempts, displayPositions, tasks, topicSlots],
  );
  const progress = useMemo(
    () =>
      buildPositionProgress(displayPositions, mappedAttempts).map(
        (position, index) => ({
          ...position,
          taskCount: displayPositions[index].taskCount,
        }),
      ),
    [displayPositions, mappedAttempts],
  );
  const mergedTaskHistory = useMemo(
    () => mergeTaskHistory(taskHistory ?? [], attemptJournal?.entries ?? []),
    [attemptJournal?.entries, taskHistory],
  );
  const mergedSimulationHistory = useMemo<SimulationArchiveRun[]>(
    () =>
      mergeSimulationArchive(
        localSimulationHistory ?? [],
        simulationArchive?.entries ?? [],
      ),
    [localSimulationHistory, simulationArchive?.entries],
  );
  const practice = useMemo(
    () => selectCabinetPractice(progress, mappedAttempts, tasks),
    [mappedAttempts, progress, tasks],
  );
  const latestPractice = latestPracticeAttempt(mergedTaskHistory);
  const latestMock = latestP1Mock(mergedSimulationHistory, exam);
  const pending =
    !hydrated ||
    attempts === null ||
    attemptJournal === null ||
    taskHistory === null ||
    localSimulationHistory === null ||
    simulationArchive === null ||
    !resumeReady;
  const started = pending
    ? false
    : hasCabinetActivity({
        attempts,
        practice: latestPractice,
        mock: latestMock,
        activeRun: resume !== null,
      });

  return (
    <main
      data-testid="cabinet-dashboard"
      data-state={pending ? "loading" : started ? "populated" : "empty"}
      className="w-full"
    >
      <div className="mx-auto flex w-[calc(100%-32px)] max-w-[1320px] flex-col gap-4 pt-6 pb-8 md:w-[calc(100%-120px)] md:gap-6 md:pt-9 md:pb-12">
        <CabinetPageHeader started={started} />
        <CabinetContinueCard
          exam={exam}
          practice={practice}
          resume={resume}
          started={started}
          tasks={tasks}
        />
        {started && (
          <>
            <CabinetPositionMap
              positions={progress}
              activePosition={
                resume?.kind === "diagnostic"
                  ? resume.current
                  : (practice?.position.number ?? null)
              }
              pending={pending}
            />
            <CabinetLatestResults
              exam={exam}
              mock={latestMock}
              practice={latestPractice}
              tasks={tasks}
            />
          </>
        )}
        <CabinetPrograms programs={programs} source={programSource} />
      </div>
    </main>
  );
}
