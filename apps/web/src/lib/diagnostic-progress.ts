import { recordGraphQLAttempts } from "./attempts-store";
import type { PersistedDiagnosticState } from "./diagnostic-store";
import {
  parseCompletedProgressRun,
  progressAttemptId,
  progressRunItemId,
  type CompletedProgressRun,
} from "./progress-run";
import {
  isProgressRunSynced,
  queueCompletedProgressRun,
} from "./progress-sync";

export type DiagnosticProgressTask = {
  id: string;
  revision: string;
  slot: number;
  examPosition: number;
  topic: string;
};

export function persistCompletedDiagnosticRun(
  state: PersistedDiagnosticState,
  tasks: readonly DiagnosticProgressTask[],
  blueprintVersion: string,
  contentRevision: string,
): boolean {
  const run = buildCompletedDiagnosticRun(
    state,
    tasks,
    blueprintVersion,
    contentRevision,
  );
  if (run === null) return false;
  if (isProgressRunSynced(run.id)) return true;

  const fallback = run.items.flatMap((item, index) => {
    if (
      item.attempt.outcome !== "CORRECT" &&
      item.attempt.outcome !== "INCORRECT"
    ) {
      return [];
    }
    return [
      {
        taskId: item.taskId,
        slot: tasks[index].slot,
        correct: item.attempt.outcome === "CORRECT",
        source: "diagnostic" as const,
        helpLevel: item.attempt.helpLevel,
        at: item.attempt.submittedAt,
      },
    ];
  });
  if (!recordGraphQLAttempts(run.id, fallback)) return false;
  void queueCompletedProgressRun(run);
  return true;
}

export function buildCompletedDiagnosticRun(
  state: PersistedDiagnosticState,
  tasks: readonly DiagnosticProgressTask[],
  blueprintVersion: string,
  contentRevision: string,
): CompletedProgressRun | null {
  const runId = state.runId;
  const startedAt = state.startedAt;
  if (
    state.phase !== "done" ||
    runId === null ||
    startedAt === null ||
    !Number.isInteger(startedAt) ||
    tasks.length !== state.taskIds.length ||
    tasks.length !== state.slots.length ||
    tasks.length !== state.answers.length ||
    tasks.length !== state.outcomes.length ||
    tasks.length !== state.completedAt.length ||
    tasks.some(
      (task, index) =>
        task.id !== state.taskIds[index] || task.slot !== state.slots[index],
    ) ||
    state.outcomes.some((outcome) => outcome === null) ||
    state.completedAt.some(
      (timestamp) =>
        timestamp === null ||
        !Number.isInteger(timestamp) ||
        timestamp < startedAt ||
        timestamp > 8_640_000_000_000_000,
    )
  ) {
    return null;
  }

  const completedAt = state.completedAt as number[];
  try {
    const candidate: CompletedProgressRun = {
      id: runId,
      kind: "DIAGNOSTIC",
      blueprintVersion,
      contentRevision,
      startedAt: new Date(startedAt).toISOString(),
      submittedAt: new Date(completedAt.at(-1) as number).toISOString(),
      items: tasks.map((task, index) => {
        const itemId = progressRunItemId(runId, task.id);
        const outcome = state.outcomes[index];
        return {
          id: itemId,
          taskId: task.id,
          examPosition: task.examPosition,
          topic: task.topic,
          taskRevision: task.revision,
          attempt: {
            id: progressAttemptId(itemId),
            startedAt: new Date(
              index === 0 ? startedAt : completedAt[index - 1],
            ).toISOString(),
            submittedAt: new Date(completedAt[index]).toISOString(),
            ...(outcome === "skipped"
              ? {}
              : { answer: JSON.stringify(state.answers[index]) }),
            outcome:
              outcome === "correct"
                ? "CORRECT"
                : outcome === "incorrect"
                  ? "INCORRECT"
                  : "SKIPPED",
            helpLevel: 0,
            gradingKind: "AUTO",
          },
        };
      }),
    };
    return parseCompletedProgressRun(candidate);
  } catch {
    return null;
  }
}
