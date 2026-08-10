import type { TaskReference } from "./content";
import type { MappedAttempt } from "./prep-readiness";
import type {
  PrepPositionDefinition,
  PrepPositionProgress,
} from "./prep-plan-types";
import { selectPositionTasks } from "./prep-task-selection";
import { difficultyBand, type DifficultyBand } from "./task-bank";

export const OVERVIEW_TASK_COUNTS = [3, 5, 10] as const;
export const OVERVIEW_MAX_TASKS = 10;

export type OverviewDifficulty = "all" | DifficultyBand;

export type OverviewTask = TaskReference & {
  difficulty: number;
};

export type OverviewPosition = PrepPositionDefinition & {
  taskCount: number;
};

export type OverviewPositionProgress = PrepPositionProgress & {
  taskCount: number;
};

export type OverviewExam = {
  version: string;
  taskCount: number;
  durationMinutes: number;
  maxPoints: number;
  officialVariantUrl: string;
};

type SelectOverviewTasksInput = {
  selectedPositions: readonly number[];
  difficulty: OverviewDifficulty;
  count: number;
  positions: readonly OverviewPosition[];
  tasks: readonly OverviewTask[];
  attempts: readonly MappedAttempt[];
};

export function selectOverviewTaskIds({
  selectedPositions,
  difficulty,
  count,
  positions,
  tasks,
  attempts,
}: SelectOverviewTasksInput): string[] {
  const selected = new Set(selectedPositions);
  const orderedPositions = positions.filter((position) =>
    selected.has(position.number),
  );
  if (orderedPositions.length === 0) return [];

  const eligibleTasks =
    difficulty === "all"
      ? tasks
      : tasks.filter((task) => difficultyBand(task.difficulty) === difficulty);
  const queues = orderedPositions.map((position) =>
    selectPositionTasks(
      position.number,
      positions,
      eligibleTasks,
      attempts,
      OVERVIEW_MAX_TASKS,
    ),
  );
  const target = Math.min(
    OVERVIEW_MAX_TASKS,
    Math.max(1, Math.trunc(Number.isFinite(count) ? count : 1)),
  );
  const result: string[] = [];
  const seen = new Set<string>();
  const longestQueue = Math.max(0, ...queues.map((queue) => queue.length));

  for (
    let index = 0;
    index < longestQueue && result.length < target;
    index += 1
  ) {
    for (const queue of queues) {
      const taskId = queue[index];
      if (!taskId || seen.has(taskId)) continue;
      result.push(taskId);
      seen.add(taskId);
      if (result.length === target) break;
    }
  }
  return result;
}
