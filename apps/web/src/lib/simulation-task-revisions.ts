import { getArchivedTask, type Task } from "./content";

export async function resolveSimulationTaskRevisionCandidates(
  current: readonly Task[],
  revisions: readonly string[],
): Promise<(Task | undefined)[]> {
  if (current.length !== revisions.length) {
    throw new Error("simulation revisions must match the current task set");
  }
  return Promise.all(
    current.map((task, index) =>
      revisions[index] === task.revision
        ? task
        : getArchivedTask(task.id, revisions[index]),
    ),
  );
}
