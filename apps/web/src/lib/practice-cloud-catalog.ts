import type {
  PracticeCloudCatalog,
  PracticeCloudTask,
} from "./practice-cloud-types";
import type { ProgressCloudCatalog } from "./progress-cloud-types";

export function projectPracticeCloudCatalog(
  catalog: ProgressCloudCatalog,
): PracticeCloudCatalog {
  const tasks = new Map<string, PracticeCloudTask>();
  for (const position of catalog.positions) {
    for (const task of position.candidates) {
      if (task.slot !== position.examPosition) {
        throw new Error(`practice task ${task.id} is in the wrong position`);
      }
      const current = tasks.get(task.id);
      if (current !== undefined && !sameTask(current, task)) {
        throw new Error(`practice catalog has conflicting task ${task.id}`);
      }
      tasks.set(task.id, { ...task });
    }
  }
  if (tasks.size === 0) {
    throw new Error("practice catalog has no tasks");
  }
  return {
    blueprintVersion: catalog.blueprintVersion,
    tasks: [...tasks.values()].toSorted(
      (left, right) =>
        left.slot - right.slot || left.id.localeCompare(right.id),
    ),
  };
}

function sameTask(left: PracticeCloudTask, right: PracticeCloudTask): boolean {
  return (
    left.revision === right.revision &&
    left.slot === right.slot &&
    left.topic === right.topic &&
    left.answerPartCount === right.answerPartCount
  );
}
