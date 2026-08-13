import type { JournalAttempt, ServerAttempt } from "./attempt-journal";
import { progressRunItemId } from "./progress-run";
import type { PersistedPracticeRun } from "./practice-runtime-types";

export function practiceRuntimeAttempts(
  runs: readonly PersistedPracticeRun[],
): ServerAttempt[] {
  return runs.flatMap((run) =>
    run.items.flatMap((item, itemIndex) => {
      const task = run.assignment.tasks[itemIndex];
      if (task === undefined || task.id !== item.taskId) return [];
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
          attempt:
            attempt.outcome === "skipped"
              ? null
              : {
                  taskId: task.id,
                  slot: task.slot,
                  correct: attempt.outcome === "correct",
                  source: "practice",
                  helpLevel: attempt.helpLevel,
                  at: submittedAt,
                },
          journal,
        };
      });
    }),
  );
}

export function samePracticeAction(
  left: JournalAttempt,
  right: JournalAttempt,
): boolean {
  return (
    left.mode === "practice" &&
    right.mode === "practice" &&
    left.taskId === right.taskId &&
    left.examPosition === right.examPosition &&
    left.startedAt === right.startedAt &&
    left.submittedAt === right.submittedAt &&
    left.answer === right.answer &&
    left.outcome === right.outcome &&
    left.helpLevel === right.helpLevel &&
    left.gradingKind === right.gradingKind &&
    left.taskRevision === right.taskRevision
  );
}

export function uniqueAttemptIds<T extends { id: string | null }>(
  entries: readonly T[],
): T[] {
  const seen = new Set<string>();
  return entries.filter(({ id }) => {
    if (id === null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
