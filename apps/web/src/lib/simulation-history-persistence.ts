import {
  isSimulationBlueprintVersion,
  isSimulationRunId,
  isSimulationTaskId,
} from "./simulation-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  SIMULATION_MAX_ANSWER_PARTS,
  SIMULATION_MAX_TASKS,
  type SimulationGradeItem,
  type SimulationHistoryEntry,
} from "./simulation-types";

export const SIMULATION_HISTORY_LIMIT = 20;

export function parseSimulationHistory(
  value: unknown,
): SimulationHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isHistoryEntry)
    .slice(0, SIMULATION_HISTORY_LIMIT)
    .map(cloneHistoryEntry);
}

export function migrateLegacySimulationHistory(
  value: unknown,
): SimulationHistoryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.history)) return [];
  return value.history
    .flatMap((entry): SimulationHistoryEntry[] => {
      if (
        !isRecord(entry) ||
        !isTimestamp(entry.finishedAt) ||
        !isFiniteInteger(entry.score, 0, 60) ||
        !Array.isArray(entry.taskIds) ||
        entry.taskIds.length < 1 ||
        entry.taskIds.length > SIMULATION_MAX_TASKS ||
        !entry.taskIds.every(isSimulationTaskId) ||
        new Set(entry.taskIds).size !== entry.taskIds.length
      ) {
        return [];
      }
      return [
        {
          id: `legacy-${entry.finishedAt}`,
          blueprintVersion: "legacy",
          startedAt: entry.finishedAt,
          finishedAt: entry.finishedAt,
          durationMs: 0,
          timedOut: false,
          score: entry.score,
          maxPoints: 60,
          correctCount: 0,
          answeredCount: 0,
          taskIds: [...entry.taskIds],
          answers: [],
          results: [],
        },
      ];
    })
    .slice(0, SIMULATION_HISTORY_LIMIT);
}

function isHistoryEntry(value: unknown): value is SimulationHistoryEntry {
  if (!isRecord(value)) return false;
  const legacy = typeof value.id === "string" && /^legacy-\d+$/.test(value.id);
  if (!(
    (isSimulationRunId(value.id) || legacy) &&
    (isSimulationBlueprintVersion(value.blueprintVersion) ||
      value.blueprintVersion === "legacy") &&
    isTimestamp(value.startedAt) &&
    isTimestamp(value.finishedAt) &&
    value.finishedAt >= value.startedAt &&
    isFiniteInteger(value.durationMs, 0, 24 * 60 * 60 * 1_000) &&
    typeof value.timedOut === "boolean" &&
    isFiniteInteger(value.score, 0, 1_000) &&
    isFiniteInteger(value.maxPoints, 1, 1_000) &&
    value.score <= value.maxPoints &&
    isFiniteInteger(value.correctCount, 0, SIMULATION_MAX_TASKS) &&
    isFiniteInteger(value.answeredCount, 0, SIMULATION_MAX_TASKS) &&
    value.correctCount <= value.answeredCount &&
    Array.isArray(value.taskIds) &&
    value.taskIds.length >= 1 &&
    value.taskIds.length <= SIMULATION_MAX_TASKS &&
    value.taskIds.every(isSimulationTaskId) &&
    new Set(value.taskIds).size === value.taskIds.length &&
    Array.isArray(value.answers) &&
    Array.isArray(value.results)
  )) {
    return false;
  }
  const taskIds = value.taskIds as string[];
  if (legacy) return value.answers.length === 0 && value.results.length === 0;
  if (
    value.answers.length !== taskIds.length ||
    !value.answers.every(
      (answers) =>
        Array.isArray(answers) &&
        answers.length >= 1 &&
        answers.length <= SIMULATION_MAX_ANSWER_PARTS &&
        answers.every(
          (answer) =>
            typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
        ),
    ) ||
    value.results.length !== taskIds.length ||
    !value.results.every((result, index) =>
      isHistoryGradeItem(result, taskIds[index]),
    )
  ) {
    return false;
  }
  const results = value.results as SimulationGradeItem[];
  return (
    value.maxPoints ===
      results.reduce((sum, result) => sum + result.maxPoints, 0) &&
    value.score ===
      results.reduce((sum, result) => sum + result.earnedPoints, 0) &&
    value.correctCount ===
      results.filter((result) => result.outcome === "correct").length &&
    value.answeredCount ===
      results.filter((result) => result.outcome !== "unanswered").length
  );
}

function isHistoryGradeItem(value: unknown, taskId: string): boolean {
  if (!isRecord(value)) return false;
  return (
    value.taskId === taskId &&
    (value.outcome === "correct" ||
      value.outcome === "incorrect" ||
      value.outcome === "unanswered") &&
    isFiniteInteger(value.maxPoints, 1, 1_000) &&
    isFiniteInteger(value.earnedPoints, 0, value.maxPoints as number) &&
    (value.outcome === "correct"
      ? value.earnedPoints === value.maxPoints
      : value.earnedPoints === 0)
  );
}

function cloneHistoryEntry(
  entry: SimulationHistoryEntry,
): SimulationHistoryEntry {
  return {
    ...entry,
    taskIds: [...entry.taskIds],
    answers: entry.answers.map((answers) => [...answers]),
    results: entry.results.map((result) => ({ ...result })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}
