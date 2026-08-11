import type { CheckKind } from "./answer";
import { MAX_TASK_ANSWER_PARTS } from "./task-draft";

export const SIMULATION_MAX_TASKS = 20;
export const SIMULATION_MAX_ANSWER_PARTS = MAX_TASK_ANSWER_PARTS;
export const SIMULATION_MAX_RENDERED_HTML_LENGTH = 500_000;
export const SIMULATION_MAX_REVIEW_MARKDOWN_LENGTH = 100_000;

export type SimulationPhase = "running" | "submitting" | "done";
export type SimulationTaskStatus = "empty" | "answered" | "skipped";
export type SimulationOutcome =
  "correct" | "partial" | "incorrect" | "unanswered";

export type SimulationTaskView = {
  id: string;
  revision: string;
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
  rubric: SimulationRubricCriterion[];
};

export type SimulationRubricCriterion = {
  id: string;
  points: number;
  text: string;
};

export type SimulationRenderedReviewItem = {
  taskId: string;
  correctAnswerHtml: string;
  solutionHtml: string;
  rubric: SimulationRenderedRubricCriterion[];
};

export type SimulationRenderedRubricCriterion = Omit<
  SimulationRubricCriterion,
  "text"
> & { textHtml: string };

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
  rubricScores?: (number | null)[];
  progress?: SimulationProgressMetadata;
  archiveSnapshot?: SimulationArchiveSnapshot;
  ownerId?: string | null;
};

export type SimulationArchiveSnapshot = {
  contentRevision: string;
  taskRevisions: string[];
};

export type SimulationProgressMetadata = {
  contentRevision: string;
  items: SimulationProgressItem[];
};

export type SimulationProgressItem = {
  taskId: string;
  taskRevision: string;
  slot: number;
  examPosition: number;
  topic: string;
  maxPoints: number;
};

export type SimulationResultTaskView = SimulationTaskView & {
  correctAnswerHtml: string;
  solutionHtml: string;
  rubric: SimulationRenderedRubricCriterion[];
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
    rubric: review[index].rubric.map((criterion) => ({ ...criterion })),
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
        result.outcome !== "partial" &&
        result.outcome !== "incorrect" &&
        result.outcome !== "unanswered") ||
      !Number.isInteger(result.earnedPoints) ||
      (result.earnedPoints as number) < 0 ||
      (result.earnedPoints as number) > task.maxPoints ||
      result.maxPoints !== task.maxPoints ||
      (result.outcome === "correct"
        ? result.earnedPoints !== task.maxPoints
        : result.outcome === "partial"
          ? result.earnedPoints === 0 || result.earnedPoints === task.maxPoints
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
  tasks: readonly Pick<SimulationTaskView, "id" | "maxPoints">[],
): SimulationReviewItem[] | null {
  if (!Array.isArray(value) || value.length !== tasks.length) return null;
  const review: SimulationReviewItem[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    const rubric = parseRubric(candidate.rubric, tasks[index].maxPoints);
    if (
      candidate.taskId !== tasks[index].id ||
      !isBoundedReviewMarkdown(candidate.correctAnswer) ||
      !isBoundedReviewMarkdown(candidate.solution) ||
      rubric === null
    ) {
      return null;
    }
    review.push({
      taskId: tasks[index].id,
      correctAnswer: candidate.correctAnswer,
      solution: candidate.solution,
      rubric,
    });
  }
  return review;
}

function parseRubric(
  value: unknown,
  maxPoints: number,
): SimulationRubricCriterion[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const criteria: SimulationRubricCriterion[] = [];
  const ids = new Set<string>();
  for (const valueItem of value) {
    if (
      typeof valueItem !== "object" ||
      valueItem === null ||
      Array.isArray(valueItem)
    ) {
      return null;
    }
    const item = valueItem as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !/^[a-z0-9-]{1,32}$/.test(item.id) ||
      ids.has(item.id) ||
      !Number.isInteger(item.points) ||
      (item.points as number) < 1 ||
      !isBoundedReviewMarkdown(item.text)
    ) {
      return null;
    }
    ids.add(item.id);
    criteria.push({
      id: item.id,
      points: item.points as number,
      text: item.text,
    });
  }
  return criteria.length === 0 ||
    criteria.reduce((sum, item) => sum + item.points, 0) === maxPoints - 1
    ? criteria
    : null;
}

function isBoundedReviewMarkdown(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SIMULATION_MAX_REVIEW_MARKDOWN_LENGTH
  );
}
