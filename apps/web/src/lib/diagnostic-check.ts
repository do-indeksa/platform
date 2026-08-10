import { checkAnswer, type CheckPart } from "./answer";
import { isDiagnosticTaskId } from "./diagnostic-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";

export type DiagnosticCheckRequest = {
  taskId: string;
  topic: string;
  answers: string[];
};

export type DiagnosticCheckOutcome = "correct" | "incorrect" | "invalid";

const TOPIC_PATTERN = /^[a-z0-9-]{1,64}$/;

export function parseDiagnosticCheckRequest(
  value: unknown,
): DiagnosticCheckRequest | null {
  if (!isRecord(value)) return null;
  if (
    !isDiagnosticTaskId(value.taskId) ||
    typeof value.topic !== "string" ||
    !TOPIC_PATTERN.test(value.topic) ||
    !Array.isArray(value.answers) ||
    value.answers.length < 1 ||
    value.answers.length > 5 ||
    !value.answers.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  ) {
    return null;
  }
  return {
    taskId: value.taskId,
    topic: value.topic,
    answers: value.answers,
  };
}

export function checkDiagnosticAnswers(
  parts: readonly CheckPart[],
  answers: readonly string[],
): DiagnosticCheckOutcome {
  if (parts.length === 0 || parts.length !== answers.length) return "invalid";
  const results = parts.map((part, index) => checkAnswer(part, answers[index]));
  if (results.includes("invalid")) return "invalid";
  return results.every((result) => result === "correct")
    ? "correct"
    : "incorrect";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
