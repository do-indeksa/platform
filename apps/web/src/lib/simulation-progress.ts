import { recordGraphQLAttempts } from "./attempts-store";
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
import { parseSimulationHistory } from "./simulation-history-persistence";
import type {
  SimulationHistoryEntry,
  SimulationProgressMetadata,
} from "./simulation-types";

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
        return {
          id: itemId,
          taskId: item.taskId,
          examPosition: item.examPosition,
          topic: item.topic,
          maxPoints: item.maxPoints,
          taskRevision: item.taskRevision,
          attempt: {
            id: progressAttemptId(itemId),
            startedAt,
            submittedAt,
            ...(result.outcome === "unanswered"
              ? {}
              : { answer: JSON.stringify(entry.answers[index]) }),
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
