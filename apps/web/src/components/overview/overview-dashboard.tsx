"use client";

import { useMemo } from "react";
import { useAttempts } from "@/lib/attempts-store";
import type {
  OverviewExam,
  OverviewPosition,
  OverviewTask,
} from "@/lib/overview";
import {
  buildPositionProgress,
  mapAttemptsToPositions,
} from "@/lib/prep-readiness";
import type { PrepTopicSlot } from "@/lib/prep-plan";
import { useHydrated } from "@/lib/use-hydrated";
import { ContinueRun } from "./continue-run";
import { ExamResources } from "./exam-resources";
import { OverviewHero } from "./overview-hero";
import { P1Programs } from "./p1-programs";
import { PositionOverview } from "./position-overview";
import { PracticeBuilder } from "./practice-builder";

export function OverviewDashboard({
  exam,
  positions,
  tasks,
  topicSlots,
  programs,
  programSource,
}: {
  exam: OverviewExam;
  positions: OverviewPosition[];
  tasks: OverviewTask[];
  topicSlots: PrepTopicSlot[];
  programs: string[];
  programSource: string;
}) {
  const hydrated = useHydrated();
  const attempts = useAttempts();
  const mappedAttempts = useMemo(
    () => mapAttemptsToPositions(attempts ?? [], positions, topicSlots, tasks),
    [attempts, positions, tasks, topicSlots],
  );
  const progress = useMemo(
    () =>
      buildPositionProgress(positions, mappedAttempts).map(
        (position, index) => ({
          ...position,
          taskCount: positions[index].taskCount,
        }),
      ),
    [mappedAttempts, positions],
  );
  const pending = !hydrated || attempts === null;

  return (
    <main className="w-full">
      <OverviewHero exam={exam} publishedTaskCount={tasks.length} />
      <PracticeBuilder
        positions={positions}
        tasks={tasks}
        attempts={mappedAttempts}
      />
      <ContinueRun />
      <PositionOverview positions={progress} pending={pending} />
      <ExamResources exam={exam} />
      <P1Programs programs={programs} source={programSource} />
    </main>
  );
}
