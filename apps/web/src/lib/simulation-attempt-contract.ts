import type {
  CompletedProgressAttempt,
  CompletedProgressItem,
} from "./progress-run";

const MAX_ANSWER_PARTS = 6;
const MAX_ANSWER_PART_LENGTH = 200;

export function isRestorableSimulationAttemptSet(
  items: readonly CompletedProgressItem[],
  runStartedAt: string,
  runSubmittedAt: string,
): boolean {
  const snapshotted = items.filter(
    (item) => item.answerPartCount !== undefined,
  );
  return (
    snapshotted.length === 0 ||
    (snapshotted.length === items.length &&
      snapshotted.every((item) =>
        isRestorableSimulationItem(item, runStartedAt, runSubmittedAt),
      ))
  );
}

export function hasSnapshottedSimulationAnswerShape(
  attempt: CompletedProgressAttempt,
  answerPartCount: number,
): boolean {
  return attempt.outcome === "SKIPPED"
    ? attempt.answer === undefined
    : parseAnswerParts(attempt.answer, answerPartCount) !== null;
}

function isRestorableSimulationItem(
  item: CompletedProgressItem,
  runStartedAt: string,
  runSubmittedAt: string,
): boolean {
  const attempt = item.attempt;
  const previous = item.previousAttempt;
  if (
    !isRestorableSimulationAttempt(attempt, item, runStartedAt, runSubmittedAt)
  ) {
    return false;
  }
  if (attempt.gradingKind === "AUTO") return previous === undefined;
  if (
    previous === undefined ||
    !isRestorableSimulationAttempt(
      previous,
      item,
      runStartedAt,
      runSubmittedAt,
    ) ||
    previous.gradingKind !== "AUTO"
  ) {
    return false;
  }
  const previousAnswers = simulationAttemptAnswers(
    previous,
    item.answerPartCount as number,
  );
  const finalAnswers = simulationAttemptAnswers(
    attempt,
    item.answerPartCount as number,
  );
  if (
    previousAnswers === null ||
    finalAnswers === null ||
    !sameStrings(previousAnswers, finalAnswers) ||
    isSkippedAttempt(previous, previousAnswers) !==
      isSkippedAttempt(attempt, finalAnswers)
  ) {
    return false;
  }
  return previous.outcome === "INCORRECT"
    ? attempt.outcome === "PARTIAL" || attempt.outcome === "INCORRECT"
    : previous.outcome === "SKIPPED" &&
        (attempt.outcome === "PARTIAL" || attempt.outcome === "SKIPPED");
}

function isRestorableSimulationAttempt(
  attempt: CompletedProgressAttempt,
  item: CompletedProgressItem,
  runStartedAt: string,
  runSubmittedAt: string,
): boolean {
  if (
    attempt.startedAt !== runStartedAt ||
    attempt.submittedAt !== runSubmittedAt ||
    attempt.helpLevel !== 0
  ) {
    return false;
  }
  if (attempt.outcome === "SKIPPED") {
    return attempt.answer === undefined && attempt.earnedPoints === undefined;
  }
  const answers = parseAnswerParts(
    attempt.answer,
    item.answerPartCount as number,
  );
  if (answers === null) return false;
  if (attempt.gradingKind === "AUTO") {
    return (
      ((attempt.outcome === "CORRECT" &&
        attempt.earnedPoints === item.maxPoints) ||
        (attempt.outcome === "INCORRECT" && attempt.earnedPoints === 0)) &&
      answers.some((answer) => answer.trim() !== "")
    );
  }
  return (
    (attempt.outcome === "PARTIAL" &&
      typeof attempt.earnedPoints === "number" &&
      typeof item.maxPoints === "number" &&
      attempt.earnedPoints > 0 &&
      attempt.earnedPoints < item.maxPoints) ||
    (attempt.outcome === "INCORRECT" &&
      attempt.earnedPoints === 0 &&
      answers.some((answer) => answer.trim() !== ""))
  );
}

function simulationAttemptAnswers(
  attempt: CompletedProgressAttempt,
  answerPartCount: number,
): string[] | null {
  return attempt.outcome === "SKIPPED"
    ? Array<string>(answerPartCount).fill("")
    : parseAnswerParts(attempt.answer, answerPartCount);
}

function isSkippedAttempt(
  attempt: CompletedProgressAttempt,
  answers: readonly string[],
): boolean {
  return (
    attempt.outcome === "SKIPPED" || answers.every((answer) => answer === "")
  );
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parseAnswerParts(
  value: unknown,
  answerPartCount: number,
): string[] | null {
  if (typeof value !== "string") return null;
  try {
    const answers: unknown = JSON.parse(value);
    return Array.isArray(answers) &&
      answers.length === answerPartCount &&
      answers.length >= 1 &&
      answers.length <= MAX_ANSWER_PARTS &&
      answers.every(
        (answer) =>
          typeof answer === "string" && answer.length <= MAX_ANSWER_PART_LENGTH,
      )
      ? [...answers]
      : null;
  } catch {
    return null;
  }
}
