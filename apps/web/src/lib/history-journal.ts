import type {
  JournalAttempt,
  JournalAttemptOutcome,
  JournalGradingKind,
} from "./attempt-journal";
import {
  ERROR_PRACTICE_LIMIT,
  type TaskHistoryEntry,
  type TaskHistoryOutcome,
  type TaskHistorySource,
} from "./task-history";
import { SIMULATION_MAX_ANSWER_PARTS } from "./simulation-types";

const DEDUPLICATION_WINDOW_MS = 3_000;

export type HistoryAttemptOutcome = TaskHistoryOutcome | "partial" | "ungraded";

export type HistoryAttempt = {
  id: string;
  taskId: string;
  slot: number;
  source: TaskHistorySource;
  outcome: HistoryAttemptOutcome;
  answers: string[];
  helpLevel: number;
  at: string;
  startedAt?: string;
  activeDurationMs?: number;
  gradingKind?: JournalGradingKind;
  earnedPoints?: number;
  maxPoints?: number;
  taskRevision?: string;
};

export function mergeTaskHistory(
  localEntries: readonly TaskHistoryEntry[],
  journalAttempts: readonly JournalAttempt[],
): HistoryAttempt[] {
  const local = localEntries.map(fromLocalEntry);
  const usedLocal = new Set<number>();
  const journal = journalAttempts.map(fromJournalAttempt).map((entry) => {
    const localIndex = local.findIndex(
      (candidate, index) =>
        !usedLocal.has(index) && sameAttempt(candidate, entry),
    );
    if (localIndex < 0) return entry;
    usedLocal.add(localIndex);
    return {
      ...entry,
      helpLevel: Math.max(entry.helpLevel, local[localIndex].helpLevel),
    };
  });

  return [
    ...journal,
    ...local.filter((_, index) => !usedLocal.has(index)),
  ].toSorted(
    (left, right) =>
      Date.parse(right.at) - Date.parse(left.at) ||
      left.id.localeCompare(right.id),
  );
}

export function recentHistoryErrorTaskIds(
  entries: readonly HistoryAttempt[],
  limit = ERROR_PRACTICE_LIMIT,
): string[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const seen = new Set<string>();
  const taskIds: string[] = [];
  for (const entry of entries) {
    if (
      (entry.outcome !== "incorrect" && entry.outcome !== "partial") ||
      seen.has(entry.taskId)
    ) {
      continue;
    }
    seen.add(entry.taskId);
    taskIds.push(entry.taskId);
    if (taskIds.length === limit) break;
  }
  return taskIds;
}

function fromLocalEntry(entry: TaskHistoryEntry): HistoryAttempt {
  return { ...entry, answers: [...entry.answers] };
}

function fromJournalAttempt(attempt: JournalAttempt): HistoryAttempt {
  return {
    id: attempt.id,
    taskId: attempt.taskId,
    slot: attempt.examPosition,
    source: attempt.mode,
    outcome: historyOutcome(attempt.outcome),
    answers: parseAnswers(attempt.answer),
    helpLevel: attempt.helpLevel,
    at: attempt.submittedAt,
    startedAt: attempt.startedAt,
    ...(attempt.activeDurationMs === undefined
      ? {}
      : { activeDurationMs: attempt.activeDurationMs }),
    gradingKind: attempt.gradingKind,
    ...(attempt.earnedPoints === undefined
      ? {}
      : { earnedPoints: attempt.earnedPoints }),
    ...(attempt.maxPoints === undefined
      ? {}
      : { maxPoints: attempt.maxPoints }),
    ...(attempt.taskRevision === undefined
      ? {}
      : { taskRevision: attempt.taskRevision }),
  };
}

function historyOutcome(outcome: JournalAttemptOutcome): HistoryAttemptOutcome {
  switch (outcome) {
    case "CORRECT":
      return "correct";
    case "INCORRECT":
      return "incorrect";
    case "PARTIAL":
      return "partial";
    case "SKIPPED":
      return "skipped";
    case "UNGRADED":
      return "ungraded";
  }
}

function parseAnswers(answer: string | undefined): string[] {
  if (answer === undefined) return [""];
  try {
    const parsed: unknown = JSON.parse(answer);
    if (
      Array.isArray(parsed) &&
      parsed.length >= 1 &&
      parsed.length <= SIMULATION_MAX_ANSWER_PARTS &&
      parsed.every((part) => typeof part === "string")
    ) {
      return [...parsed];
    }
  } catch {}
  return [answer];
}

function sameAttempt(left: HistoryAttempt, right: HistoryAttempt): boolean {
  return (
    (left.id === right.id ||
      Math.abs(Date.parse(left.at) - Date.parse(right.at)) <=
        DEDUPLICATION_WINDOW_MS) &&
    left.taskId === right.taskId &&
    left.slot === right.slot &&
    left.source === right.source &&
    left.outcome === right.outcome &&
    sameAnswers(left.answers, right.answers)
  );
}

function sameAnswers(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((answer, index) => answer === right[index])
  );
}
