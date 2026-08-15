import type { JournalAttempt, ServerAttempt } from "./attempt-journal";
import type { Attempt } from "./knowledge";
import type { LearningRunOwnerId } from "./learning-run-owner";
import { progressRunItemId } from "./progress-run";
import type { PersistedPracticeRun } from "./practice-runtime-types";

export function projectPracticeRuntimeAttempts(
  runs: readonly PersistedPracticeRun[],
  ownerId: LearningRunOwnerId,
): ServerAttempt[] {
  return runs
    .filter((run) => run.runOwnerId === ownerId)
    .flatMap((run) =>
      run.items.flatMap((item, itemIndex) => {
        const task = run.assignment.tasks[itemIndex];
        if (task === undefined || item.taskId !== task.id) return [];
        const runItemId = progressRunItemId(run.assignment.runId, task.id);
        return item.attempts.map((attempt): ServerAttempt => {
          const outcome =
            attempt.outcome.toUpperCase() as JournalAttempt["outcome"];
          const submittedAt = new Date(attempt.submittedAt).toISOString();
          const journal: JournalAttempt = {
            id: attempt.id,
            runItemId,
            taskId: task.id,
            examPosition: task.slot,
            mode: "practice",
            startedAt: new Date(attempt.startedAt).toISOString(),
            submittedAt,
            ...(attempt.activeDurationMs === null
              ? {}
              : { activeDurationMs: attempt.activeDurationMs }),
            answer: JSON.stringify(attempt.answers),
            outcome,
            helpLevel: attempt.helpLevel,
            gradingKind: "AUTO",
            taskRevision: task.revision,
          };
          return {
            id: attempt.id,
            attempt: masteryAttempt(journal),
            journal,
          };
        });
      }),
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.journal.submittedAt) -
          Date.parse(right.journal.submittedAt) ||
        left.id.localeCompare(right.id),
    );
}

export function practiceJournalFingerprint(attempt: JournalAttempt): string {
  return JSON.stringify([
    attempt.taskId,
    attempt.examPosition,
    attempt.mode,
    attempt.startedAt,
    attempt.submittedAt,
    attempt.activeDurationMs ?? null,
    attempt.answer ?? null,
    attempt.outcome,
    attempt.helpLevel,
    attempt.gradingKind,
    attempt.earnedPoints ?? null,
    attempt.maxPoints ?? null,
    attempt.taskRevision ?? null,
  ]);
}

function masteryAttempt(journal: JournalAttempt): Attempt | null {
  if (journal.outcome !== "CORRECT" && journal.outcome !== "INCORRECT") {
    return null;
  }
  return {
    taskId: journal.taskId,
    slot: journal.examPosition,
    correct: journal.outcome === "CORRECT",
    source: "practice",
    helpLevel: journal.helpLevel,
    at: journal.submittedAt,
  };
}
