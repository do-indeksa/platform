import type { CheckKind } from "./answer";

export const SIMULATION_MAX_TASKS = 20;
export const SIMULATION_MAX_ANSWER_PARTS = 6;
export const SIMULATION_MAX_RENDERED_HTML_LENGTH = 500_000;
export const SIMULATION_MAX_REVIEW_MARKDOWN_LENGTH = 100_000;

export type SimulationPhase = "running" | "submitting" | "done";
export type SimulationTaskStatus = "empty" | "answered" | "skipped";
export type SimulationOutcome = "correct" | "incorrect" | "unanswered";

export type SimulationTaskView = {
  id: string;
  slot: number;
  examPosition: number;
  maxPoints: number;
  topic: string;
  topicName: string;
  statementHtml: string;
  fields: { label?: string; kind: CheckKind }[];
};

export type SimulationGradeItem = {
  taskId: string;
  outcome: SimulationOutcome;
  earnedPoints: number;
  maxPoints: number;
};

export type SimulationReviewItem = {
  taskId: string;
  correctAnswer: string;
  solution: string;
};

export type SimulationRenderedReviewItem = {
  taskId: string;
  correctAnswerHtml: string;
  solutionHtml: string;
};

export type SimulationHistoryEntry = {
  id: string;
  blueprintVersion: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  timedOut: boolean;
  score: number;
  maxPoints: number;
  correctCount: number;
  answeredCount: number;
  taskIds: string[];
  answers: string[][];
  results: SimulationGradeItem[];
};

export type SimulationResultTaskView = SimulationTaskView & {
  correctAnswerHtml: string;
  solutionHtml: string;
};

export function attachSimulationReview(
  tasks: readonly SimulationTaskView[],
  review: readonly SimulationRenderedReviewItem[],
): SimulationResultTaskView[] | null {
  if (
    review.length !== tasks.length ||
    review.some((item, index) => item.taskId !== tasks[index].id)
  ) {
    return null;
  }
  return tasks.map((task, index) => ({
    ...task,
    fields: task.fields.map((field) => ({ ...field })),
    correctAnswerHtml: review[index].correctAnswerHtml,
    solutionHtml: review[index].solutionHtml,
  }));
}

export function simulationTaskStatus(
  answers: readonly string[],
  skipped: boolean,
): SimulationTaskStatus {
  if (answers.some((answer) => answer.trim() !== "")) return "answered";
  return skipped ? "skipped" : "empty";
}

export function parseSimulationGradeItems(
  value: unknown,
  tasks: readonly Pick<SimulationTaskView, "id" | "maxPoints">[],
): SimulationGradeItem[] | null {
  if (!Array.isArray(value) || value.length !== tasks.length) return null;
  const results: SimulationGradeItem[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const result = item as Record<string, unknown>;
    const task = tasks[index];
    if (
      result.taskId !== task.id ||
      (result.outcome !== "correct" &&
        result.outcome !== "incorrect" &&
        result.outcome !== "unanswered") ||
      !Number.isInteger(result.earnedPoints) ||
      (result.earnedPoints as number) < 0 ||
      (result.earnedPoints as number) > task.maxPoints ||
      result.maxPoints !== task.maxPoints ||
      (result.outcome === "correct"
        ? result.earnedPoints !== task.maxPoints
        : result.earnedPoints !== 0)
    ) {
      return null;
    }
    results.push({
      taskId: task.id,
      outcome: result.outcome,
      earnedPoints: result.earnedPoints as number,
      maxPoints: task.maxPoints,
    });
  }
  return results;
}

export function parseSimulationReviewItems(
  value: unknown,
  tasks: readonly Pick<SimulationTaskView, "id">[],
): SimulationReviewItem[] | null {
  if (!Array.isArray(value) || value.length !== tasks.length) return null;
  const review: SimulationReviewItem[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    if (
      candidate.taskId !== tasks[index].id ||
      !isBoundedReviewMarkdown(candidate.correctAnswer) ||
      !isBoundedReviewMarkdown(candidate.solution)
    ) {
      return null;
    }
    review.push({
      taskId: tasks[index].id,
      correctAnswer: candidate.correctAnswer,
      solution: candidate.solution,
    });
  }
  return review;
}

function isBoundedReviewMarkdown(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SIMULATION_MAX_REVIEW_MARKDOWN_LENGTH
  );
}
