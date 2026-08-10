import type {
  SimulationHistoryEntry,
  SimulationResultTaskView,
} from "./simulation-types";

export type SimulationResultSummary = {
  score: number;
  maxPoints: number;
  correctCount: number;
  answeredCount: number;
  totalCount: number;
  durationMs: number;
  delta: number | null;
  complete: boolean;
  strongPositions: number[];
  weakPositions: number[];
  unansweredPositions: number[];
  practiceTaskIds: string[];
};

export function buildSimulationResultSummary(
  entry: SimulationHistoryEntry,
  history: readonly SimulationHistoryEntry[],
  tasks: readonly SimulationResultTaskView[],
): SimulationResultSummary | null {
  if (
    entry.taskIds.length !== tasks.length ||
    entry.results.length !== tasks.length ||
    entry.taskIds.some((taskId, index) => taskId !== tasks[index].id)
  ) {
    return null;
  }
  const complete = entry.answeredCount === tasks.length;
  const previous = history.find(
    (candidate) =>
      candidate.id !== entry.id &&
      candidate.answeredCount === candidate.taskIds.length &&
      candidate.maxPoints === entry.maxPoints,
  );
  const positions = (outcome: "correct" | "incorrect" | "unanswered") =>
    entry.results.flatMap((result, index) =>
      result.outcome === outcome ? [tasks[index].examPosition] : [],
    );
  const weakTaskIds = entry.results.flatMap((result) =>
    result.outcome === "incorrect" ? [result.taskId] : [],
  );
  const unansweredTaskIds = entry.results.flatMap((result) =>
    result.outcome === "unanswered" ? [result.taskId] : [],
  );

  return {
    score: entry.score,
    maxPoints: entry.maxPoints,
    correctCount: entry.correctCount,
    answeredCount: entry.answeredCount,
    totalCount: tasks.length,
    durationMs: entry.durationMs,
    delta: complete && previous ? entry.score - previous.score : null,
    complete,
    strongPositions: positions("correct"),
    weakPositions: positions("incorrect"),
    unansweredPositions: positions("unanswered"),
    practiceTaskIds: weakTaskIds.length > 0 ? weakTaskIds : unansweredTaskIds,
  };
}

export function formatExamDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
