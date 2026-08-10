import type { TaskReference } from "@/lib/content";
import type { MappedAttempt } from "./prep-readiness";
import type {
  PrepPositionDefinition,
  PrepPositionProgress,
} from "./prep-plan-types";

export function selectPositionTasks(
  positionNumber: number,
  positions: readonly PrepPositionDefinition[],
  taskReferences: readonly TaskReference[],
  attempts: readonly MappedAttempt[],
  count: number,
): string[] {
  const topics = new Set(
    positions.find((position) => position.number === positionNumber)
      ?.topicSlugs ?? [],
  );
  const latestByTask = new Map<string, MappedAttempt>();
  for (const attempt of attempts) latestByTask.set(attempt.taskId, attempt);
  return taskReferences
    .filter((task) => topics.has(task.topic))
    .toSorted((left, right) => {
      const leftAttempt = latestByTask.get(left.id);
      const rightAttempt = latestByTask.get(right.id);
      return (
        taskPriority(leftAttempt) - taskPriority(rightAttempt) ||
        Date.parse(leftAttempt?.at ?? "1970-01-01") -
          Date.parse(rightAttempt?.at ?? "1970-01-01") ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, count)
    .map((task) => task.id);
}

export function selectCheckTasks(
  progress: readonly PrepPositionProgress[],
  positions: readonly PrepPositionDefinition[],
  taskReferences: readonly TaskReference[],
  attempts: readonly MappedAttempt[],
  excludedTaskIds: ReadonlySet<string>,
  count: number,
): string[] {
  const orderedPositions = [...progress].sort(
    (left, right) =>
      Date.parse(left.lastAttemptAt ?? "1970-01-01") -
        Date.parse(right.lastAttemptAt ?? "1970-01-01") ||
      left.readiness - right.readiness ||
      left.number - right.number,
  );
  const selected: string[] = [];
  for (const position of orderedPositions) {
    const task = selectPositionTasks(
      position.number,
      positions,
      taskReferences,
      attempts,
      count,
    ).find((taskId) => !excludedTaskIds.has(taskId));
    if (task) selected.push(task);
    if (selected.length === count) break;
  }
  return selected;
}

function taskPriority(attempt: MappedAttempt | undefined): number {
  if (attempt && !attempt.correct) return 0;
  if (!attempt) return 1;
  if (attempt.helpLevel > 0) return 2;
  return 3;
}
