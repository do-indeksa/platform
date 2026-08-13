import type {
  PracticeCloudCatalog,
  PracticeCloudTask,
} from "./practice-cloud-types";
import type { PersistedPracticeRun } from "./practice-runtime-types";
import { taskPracticeHref } from "./task-bank";

export type PracticeRuntimeResume = {
  runId: string;
  taskIds: string[];
  currentTask: PracticeCloudTask;
  current: number;
  total: number;
  completed: number;
  activeDurationMs: number;
};

export function selectPracticeRuntimeResume(
  runs: readonly PersistedPracticeRun[],
  ownerId: string | null | undefined,
  catalog: PracticeCloudCatalog,
): PracticeRuntimeResume | null {
  if (ownerId === undefined) return null;
  const currentTasks = new Map(catalog.tasks.map((task) => [task.id, task]));
  const run = runs
    .filter(
      (candidate) =>
        candidate.runOwnerId === ownerId &&
        candidate.phase === "active" &&
        candidate.assignment.blueprintVersion === catalog.blueprintVersion &&
        candidate.assignment.tasks.length > 0 &&
        candidate.assignment.tasks.every((task) =>
          sameTask(task, currentTasks.get(task.id)),
        ) &&
        candidate.currentIndex >= 0 &&
        candidate.currentIndex < candidate.assignment.tasks.length,
    )
    .toSorted(compareRuns)[0];
  if (run === undefined) return null;
  const currentTask = run.assignment.tasks[run.currentIndex];
  if (currentTask === undefined) return null;

  return {
    runId: run.assignment.runId,
    taskIds: run.assignment.tasks.map(({ id }) => id),
    currentTask: { ...currentTask },
    current: run.currentIndex + 1,
    total: run.assignment.tasks.length,
    completed: run.items.filter(({ attempts }) => {
      const outcome = attempts.at(-1)?.outcome;
      return outcome === "correct" || outcome === "skipped";
    }).length,
    activeDurationMs: run.activeDurationMs,
  };
}

export function practiceRuntimeResumeHref(
  resume: PracticeRuntimeResume,
  returnTo: string,
): string {
  return taskPracticeHref(
    resume.currentTask,
    returnTo,
    resume.taskIds,
    resume.runId,
    { requireRuntime: true },
  );
}

function compareRuns(
  left: PersistedPracticeRun,
  right: PersistedPracticeRun,
): number {
  return (
    right.startedAt - left.startedAt ||
    right.updatedAt - left.updatedAt ||
    left.assignment.runId.localeCompare(right.assignment.runId)
  );
}

function sameTask(
  left: PracticeCloudTask,
  right: PracticeCloudTask | undefined,
): boolean {
  return (
    right !== undefined &&
    left.revision === right.revision &&
    left.slot === right.slot &&
    left.topic === right.topic &&
    left.answerPartCount === right.answerPartCount
  );
}
