import type {
  PracticeCloudCatalog,
  PracticeCloudTask,
} from "./practice-cloud-types";
import type { ProgressCloudCatalog } from "./progress-cloud-types";

export type ProjectedPracticeCloudCatalog = PracticeCloudCatalog & {
  examPositionByTaskId: ReadonlyMap<string, number>;
};

export function projectPracticeCloudCatalog(
  catalog: ProgressCloudCatalog,
): ProjectedPracticeCloudCatalog {
  const tasks = new Map<string, PracticeCloudTask>();
  const examPositionByTaskId = new Map<string, number>();
  for (const position of catalog.positions) {
    if (
      !Number.isSafeInteger(position.examPosition) ||
      position.examPosition < 1 ||
      position.examPosition > 10
    ) {
      throw new Error("practice catalog has an invalid exam position");
    }
    for (const task of position.candidates) {
      const current = tasks.get(task.id);
      if (current !== undefined && !sameTask(current, task)) {
        throw new Error(`practice catalog has conflicting task ${task.id}`);
      }
      const currentPosition = examPositionByTaskId.get(task.id);
      if (
        currentPosition !== undefined &&
        currentPosition !== position.examPosition
      ) {
        throw new Error(
          `practice task ${task.id} has ambiguous exam positions`,
        );
      }
      tasks.set(task.id, { ...task });
      examPositionByTaskId.set(task.id, position.examPosition);
    }
  }
  if (tasks.size === 0) {
    throw new Error("practice catalog has no tasks");
  }
  return {
    blueprintVersion: catalog.blueprintVersion,
    tasks: [...tasks.values()].toSorted(
      (left, right) =>
        (examPositionByTaskId.get(left.id) ?? 0) -
          (examPositionByTaskId.get(right.id) ?? 0) ||
        left.id.localeCompare(right.id),
    ),
    examPositionByTaskId,
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
