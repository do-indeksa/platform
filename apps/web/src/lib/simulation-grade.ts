import { checkAnswer, type CheckPart } from "./answer";
import {
  isSimulationBlueprintVersion,
  isSimulationTaskId,
  isSimulationTaskRevision,
} from "./simulation-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  SIMULATION_MAX_ANSWER_PARTS,
  SIMULATION_MAX_TASKS,
  type SimulationGradeItem,
} from "./simulation-types";

export type SimulationGradeRequest = {
  blueprintVersion: string;
  taskIds: string[];
  taskRevisions?: string[];
  answers: string[][];
};

export type GradableSimulationTask = {
  id: string;
  maxPoints: number;
  check: CheckPart[];
};

export function parseSimulationGradeRequest(
  value: unknown,
): SimulationGradeRequest | null {
  if (!isRecord(value)) return null;
  if (
    !isSimulationBlueprintVersion(value.blueprintVersion) ||
    !Array.isArray(value.taskIds) ||
    value.taskIds.length < 1 ||
    value.taskIds.length > SIMULATION_MAX_TASKS ||
    !value.taskIds.every(isSimulationTaskId) ||
    new Set(value.taskIds).size !== value.taskIds.length ||
    !Array.isArray(value.answers) ||
    value.answers.length !== value.taskIds.length ||
    !value.answers.every(isAnswerParts) ||
    (value.taskRevisions !== undefined &&
      (!Array.isArray(value.taskRevisions) ||
        value.taskRevisions.length !== value.taskIds.length ||
        !value.taskRevisions.every(isSimulationTaskRevision)))
  ) {
    return null;
  }
  return {
    blueprintVersion: value.blueprintVersion,
    taskIds: [...value.taskIds],
    ...(value.taskRevisions === undefined
      ? {}
      : { taskRevisions: [...value.taskRevisions] }),
    answers: value.answers.map((answers) => [...answers]),
  };
}

export function gradeSimulationAnswers(
  tasks: readonly GradableSimulationTask[],
  answers: readonly (readonly string[])[],
): SimulationGradeItem[] | null {
  if (tasks.length === 0 || tasks.length !== answers.length) return null;
  const results: SimulationGradeItem[] = [];
  for (const [index, task] of tasks.entries()) {
    const taskAnswers = answers[index];
    if (task.check.length === 0 || task.check.length !== taskAnswers.length) {
      return null;
    }
    const answered = taskAnswers.some((answer) => answer.trim() !== "");
    const correct =
      answered &&
      task.check.every(
        (part, partIndex) =>
          checkAnswer(part, taskAnswers[partIndex]) === "correct",
      );
    results.push({
      taskId: task.id,
      outcome: answered ? (correct ? "correct" : "incorrect") : "unanswered",
      earnedPoints: correct ? task.maxPoints : 0,
      maxPoints: task.maxPoints,
    });
  }
  return results;
}

function isAnswerParts(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= SIMULATION_MAX_ANSWER_PARTS &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
