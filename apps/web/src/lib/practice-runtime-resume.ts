import { practiceTaskSetRevision } from "./practice-cloud-revision";
import type {
  PracticeCloudCatalog,
  PracticeCloudTask,
} from "./practice-cloud-types";
import type { PersistedPracticeRun } from "./practice-runtime-types";
import { parsePracticeId, taskPracticeHref } from "./task-bank";

export type PracticeRuntimeResume = {
  runId: string;
  taskIds: string[];
  currentTask: PracticeCloudTask;
  current: number;
  total: number;
  completed: number;
};

export async function selectPracticeRuntimeResume(
  runs: readonly PersistedPracticeRun[],
  ownerId: string | null | undefined,
  catalog: PracticeCloudCatalog,
): Promise<PracticeRuntimeResume | null> {
  if (ownerId === undefined) return null;
  const currentTasks = catalogTaskMap(catalog);
  if (currentTasks === null) return null;

  const candidates = runs
    .filter((run) =>
      isStaticResumeCandidate(run, ownerId, catalog, currentTasks),
    )
    .toSorted(compareRuns);
  for (const run of candidates) {
    if (
      (await practiceTaskSetRevision(run.assignment.tasks)) !==
      run.assignment.contentRevision
    ) {
      continue;
    }
    const currentTask = run.assignment.tasks[run.currentIndex];
    if (currentTask === undefined) continue;
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
    };
  }
  return null;
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

function isStaticResumeCandidate(
  run: PersistedPracticeRun,
  ownerId: string | null,
  catalog: PracticeCloudCatalog,
  currentTasks: ReadonlyMap<string, PracticeCloudTask>,
): boolean {
  return (
    run.runOwnerId === ownerId &&
    run.phase === "active" &&
    parsePracticeId(run.assignment.runId) === run.assignment.runId &&
    run.assignment.blueprintVersion === catalog.blueprintVersion &&
    run.assignment.tasks.length > 0 &&
    run.assignment.tasks.every((task) =>
      sameTask(task, currentTasks.get(task.id)),
    ) &&
    run.items.length === run.assignment.tasks.length &&
    run.items.every(
      (item, index) => item.taskId === run.assignment.tasks[index]?.id,
    ) &&
    run.currentIndex >= 0 &&
    run.currentIndex < run.assignment.tasks.length
  );
}

function catalogTaskMap(
  catalog: PracticeCloudCatalog,
): Map<string, PracticeCloudTask> | null {
  const tasks = new Map<string, PracticeCloudTask>();
  for (const task of catalog.tasks) {
    const current = tasks.get(task.id);
    if (current !== undefined && !sameTask(current, task)) return null;
    tasks.set(task.id, task);
  }
  return tasks.size > 0 ? tasks : null;
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
    left.id === right.id &&
    left.revision === right.revision &&
    left.slot === right.slot &&
    left.topic === right.topic &&
    left.answerPartCount === right.answerPartCount
  );
}
