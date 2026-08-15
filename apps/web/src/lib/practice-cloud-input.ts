import { isPracticeCloudAssignment } from "./practice-cloud-contract";
import { practiceTaskSetRevision } from "./practice-cloud-revision";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAssignment,
  type PracticeCloudAttemptInput,
  type PracticeCloudDraftInput,
  type PracticeCloudTask,
} from "./practice-cloud-types";

const CLIENT_CLOCK_SKEW_MS = 5 * 60_000;

export async function requirePracticeAssignment(
  assignment: PracticeCloudAssignment,
): Promise<void> {
  if (
    !isPracticeCloudAssignment(assignment) ||
    (await practiceTaskSetRevision(assignment.tasks)) !==
      assignment.contentRevision
  ) {
    throw new TypeError("practice assignment is invalid");
  }
}

export function requireCurrentPracticeOwner(
  isCurrentOwner: () => boolean,
): void {
  if (!isCurrentOwner()) throw new DOMException("owner changed", "AbortError");
}

export function requirePracticeDraft(
  draft: PracticeCloudDraftInput,
  task: PracticeCloudTask,
): void {
  if (
    !isPracticeInteger(draft.nextAttempt, 1, MAX_PRACTICE_ATTEMPTS_PER_TASK) ||
    !isPracticeAnswers(draft.answers, task.answerPartCount) ||
    !isPracticeInteger(draft.helpLevel, 0, 3)
  ) {
    throw new TypeError("practice checkpoint draft is invalid");
  }
}

export function isPracticeAttemptOutcome(
  value: unknown,
): value is PracticeCloudAttemptInput["outcome"] {
  return value === "correct" || value === "incorrect" || value === "skipped";
}

export function isPracticeAnswers(
  value: readonly string[],
  expected: number,
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
  );
}

export function isPracticeClientTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Date.now() + CLIENT_CLOCK_SKEW_MS
  );
}

export function isPracticeOptionalDuration(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined || isPracticeInteger(value, 0, Number.MAX_SAFE_INTEGER)
  );
}

export function isPracticeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}
