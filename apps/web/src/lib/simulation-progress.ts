import { recordGraphQLAttempts } from "./attempts-store";
import {
  parseCompletedProgressRun,
  progressAttemptId,
  progressRubricAttemptId,
  progressRunItemId,
  type CompletedProgressRun,
} from "./progress-run";
import {
  isProgressRunSynced,
  queueCompletedProgressRun,
} from "./progress-sync";
import { parseSimulationHistory } from "./simulation-history-persistence";
import {
  parsePersistedSimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import type {
  SimulationGradeItem,
  SimulationHistoryEntry,
  SimulationProgressMetadata,
} from "./simulation-types";
import { parseSimulationGradeItems } from "./simulation-types";

type SyncableHistoryEntry = SimulationHistoryEntry & {
  progress: SimulationProgressMetadata;
};

export function persistCompletedSimulationRun(
  entry: SimulationHistoryEntry,
): boolean {
  const snapshot = validatedHistoryEntry(entry);
  if (snapshot?.progress === undefined) return false;
  const run = buildValidatedSimulationRun(snapshot);
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
        slot: snapshot.progress.items[index].slot,
        correct: item.attempt.outcome === "CORRECT",
        source: "simulation" as const,
        helpLevel: item.attempt.helpLevel,
        at: item.attempt.submittedAt,
      },
    ];
  });
  if (!recordGraphQLAttempts(run.id, fallback)) return false;
  void queueCompletedProgressRun(run);
  return true;
}

export function buildCompletedSimulationRun(
  entry: SimulationHistoryEntry,
): CompletedProgressRun | null {
  const snapshot = validatedHistoryEntry(entry);
  if (snapshot?.progress === undefined) return null;
  return buildValidatedSimulationRun(snapshot);
}

export function buildSimulationAutoGradeRun(
  value: PersistedSimulationState,
  results: readonly SimulationGradeItem[],
): CompletedProgressRun | null {
  const state = parsePersistedSimulationState(value);
  const grade = parseSimulationGradeItems(results, state.tasks);
  if (
    state.phase !== "submitting" ||
    state.runId === null ||
    state.blueprintVersion === null ||
    state.contentRevision === null ||
    state.startedAt === null ||
    state.endsAt === null ||
    state.submittedAt === null ||
    grade === null ||
    grade.some((result) => result.outcome === "partial")
  ) {
    return null;
  }
  try {
    const startedAt = new Date(state.startedAt).toISOString();
    const submittedAt = new Date(state.submittedAt).toISOString();
    return parseCompletedProgressRun({
      id: state.runId,
      kind: "SIMULATION",
      blueprintVersion: `ftn-p1:${state.blueprintVersion}`,
      contentRevision: state.contentRevision,
      startedAt,
      submittedAt,
      activeDurationMs: Math.max(
        0,
        Math.min(state.submittedAt, state.endsAt) - state.startedAt,
      ),
      items: state.tasks.map((task, index) => {
        const result = grade[index];
        const itemId = progressRunItemId(state.runId as string, task.id);
        return {
          id: itemId,
          taskId: task.id,
          examPosition: task.examPosition,
          topic: task.topic,
          maxPoints: task.maxPoints,
          taskRevision: task.revision,
          attempt: {
            id: progressAttemptId(itemId),
            startedAt,
            submittedAt,
            ...(result.outcome === "unanswered"
              ? {}
              : { answer: JSON.stringify(state.answers[index]) }),
            outcome:
              result.outcome === "correct"
                ? "CORRECT"
                : result.outcome === "incorrect"
                  ? "INCORRECT"
                  : "SKIPPED",
            helpLevel: 0,
            gradingKind: "AUTO",
            ...(result.outcome === "unanswered"
              ? {}
              : { earnedPoints: result.earnedPoints }),
          },
        };
      }),
    });
  } catch {
    return null;
  }
}

function buildValidatedSimulationRun(
  entry: SyncableHistoryEntry,
): CompletedProgressRun | null {
  const progress = entry.progress;
  if (
    progress.items.length !== entry.taskIds.length ||
    entry.answers.length !== entry.taskIds.length ||
    entry.results.length !== entry.taskIds.length
  ) {
    return null;
  }

  try {
    const startedAt = new Date(entry.startedAt).toISOString();
    const submittedAt = new Date(entry.finishedAt).toISOString();
    const candidate: CompletedProgressRun = {
      id: entry.id,
      kind: "SIMULATION",
      blueprintVersion: `ftn-p1:${entry.blueprintVersion}`,
      contentRevision: progress.contentRevision,
      startedAt,
      submittedAt,
      activeDurationMs: entry.durationMs,
      items: progress.items.map((item, index) => {
        const result = entry.results[index];
        const itemId = progressRunItemId(entry.id, item.taskId);
        const rubricScore = entry.rubricScores?.[index];
        const rubricAssessed =
          rubricScore !== undefined && rubricScore !== null;
        return {
          id: itemId,
          taskId: item.taskId,
          examPosition: item.examPosition,
          topic: item.topic,
          maxPoints: item.maxPoints,
          taskRevision: item.taskRevision,
          attempt: {
            id: rubricAssessed
              ? progressRubricAttemptId(itemId)
              : progressAttemptId(itemId),
            startedAt,
            submittedAt,
            ...(result.outcome === "unanswered"
              ? {}
              : { answer: JSON.stringify(entry.answers[index]) }),
            outcome:
              result.outcome === "correct"
                ? "CORRECT"
                : result.outcome === "partial"
                  ? "PARTIAL"
                  : result.outcome === "incorrect"
                    ? "INCORRECT"
                    : "SKIPPED",
            helpLevel: 0,
            gradingKind: rubricAssessed ? "RUBRIC_SELF" : "AUTO",
            ...(result.outcome === "unanswered"
              ? {}
              : { earnedPoints: result.earnedPoints }),
          },
        };
      }),
    };
    return parseCompletedProgressRun(candidate);
  } catch {
    return null;
  }
}

function validatedHistoryEntry(
  entry: SimulationHistoryEntry,
): SyncableHistoryEntry | null {
  const parsed = parseSimulationHistory([entry]);
  const snapshot = parsed[0];
  return snapshot?.id === entry.id && snapshot.progress !== undefined
    ? (snapshot as SyncableHistoryEntry)
    : null;
}
