import type { HistoryAttempt } from "../../lib/history-journal";
import type { Attempt } from "../../lib/knowledge";
import type {
  PrepPositionDefinition,
  PrepPositionProgress,
} from "../../lib/prep-plan-types";
import type { MappedAttempt } from "../../lib/prep-readiness";
import { selectPositionTasks } from "../../lib/prep-task-selection";
import type { SimulationArchiveRun } from "../../lib/simulation-archive";
import type { TaskReference } from "../../lib/content";

export const CABINET_PRACTICE_TARGET = 5;
export const CABINET_TASK_MINUTES = 5;

export type CabinetTask = TaskReference & {
  difficulty: number;
  topicLabel: string;
};

export type CabinetPosition = PrepPositionDefinition & {
  taskCount: number;
};

export type CabinetPositionProgress = PrepPositionProgress & {
  taskCount: number;
};

export type CabinetExam = {
  version: string;
  taskCount: number;
  durationMinutes: number;
  maxPoints: number;
  officialVariantUrl: string;
};

export type CabinetPractice = {
  position: PrepPositionProgress;
  taskIds: string[];
  completed: number;
  target: number;
  progress: number;
  minutes: number;
  difficulty: "foundation" | "exam" | "advanced";
};

export function selectCabinetPractice(
  positions: readonly CabinetPositionProgress[],
  attempts: readonly MappedAttempt[],
  tasks: readonly CabinetTask[],
): CabinetPractice | null {
  if (positions.length === 0) return null;

  const latestPosition = attempts.at(-1)?.position;
  const position =
    positions.find(({ number }) => number === latestPosition) ??
    positions.toSorted(comparePositionPriority)[0];
  if (!position) return null;

  const taskIds = selectPositionTasks(
    position.number,
    positions,
    tasks,
    attempts,
    CABINET_PRACTICE_TARGET,
  );
  const positionAttempts = attempts
    .filter((attempt) => attempt.position === position.number)
    .slice(-CABINET_PRACTICE_TARGET);
  const completed = new Set(positionAttempts.map(({ taskId }) => taskId)).size;
  const target = Math.max(
    1,
    Math.min(CABINET_PRACTICE_TARGET, position.taskCount || taskIds.length),
  );
  const selectedTasks = taskIds.flatMap((taskId) => {
    const task = tasks.find(({ id }) => id === taskId);
    return task ? [task] : [];
  });

  return {
    position,
    taskIds,
    completed: Math.min(completed, target),
    target,
    progress: Math.round((Math.min(completed, target) / target) * 100),
    minutes: Math.max(1, taskIds.length || target) * CABINET_TASK_MINUTES,
    difficulty: difficultyBand(selectedTasks),
  };
}

export function latestPracticeAttempt(
  history: readonly HistoryAttempt[],
): HistoryAttempt | null {
  return history.find(({ source }) => source === "practice") ?? null;
}

export function latestP1Mock(
  history: readonly SimulationArchiveRun[],
  exam: { taskCount: number; maxPoints: number },
): SimulationArchiveRun | null {
  return (
    history.find(
      ({ score, maxPoints, taskIds }) =>
        score !== null &&
        maxPoints === exam.maxPoints &&
        taskIds.length === exam.taskCount,
    ) ?? null
  );
}

export function hasCabinetActivity({
  attempts,
  practice,
  mock,
  activeRun,
}: {
  attempts: readonly Attempt[];
  practice: HistoryAttempt | null;
  mock: SimulationArchiveRun | null;
  activeRun: boolean;
}): boolean {
  return attempts.length > 0 || practice !== null || mock !== null || activeRun;
}

export function cabinetProgram(program: string, index: number) {
  const code =
    /\(([^()]+)\)\s*$/.exec(program)?.[1] ?? shortProgramCode(program);
  return {
    code: code.slice(0, 3).toUpperCase() || `P${index + 1}`,
    name: program,
  };
}

function comparePositionPriority(
  left: PrepPositionProgress,
  right: PrepPositionProgress,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    left.readiness - right.readiness ||
    right.errors - left.errors ||
    left.number - right.number
  );
}

function statusRank(status: PrepPositionProgress["status"]): number {
  switch (status) {
    case "needsWork":
      return 0;
    case "untested":
      return 1;
    case "starting":
      return 2;
    case "progressing":
      return 3;
    case "confident":
      return 4;
  }
}

function difficultyBand(
  tasks: readonly Pick<CabinetTask, "difficulty">[],
): CabinetPractice["difficulty"] {
  if (tasks.length === 0) return "exam";
  const average =
    tasks.reduce((sum, { difficulty }) => sum + difficulty, 0) / tasks.length;
  if (average <= 2) return "foundation";
  if (average >= 4) return "advanced";
  return "exam";
}

function shortProgramCode(program: string): string {
  return program
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}
