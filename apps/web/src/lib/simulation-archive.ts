import { SIMULATION_HISTORY_LIMIT } from "./simulation-history-persistence";
import type { SimulationHistoryEntry } from "./simulation-types";

export type SimulationArchiveOutcome =
  "correct" | "incorrect" | "partial" | "unanswered" | "ungraded";

export type SimulationArchiveRun = {
  id: string;
  blueprintVersion: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  timedOut: boolean;
  score: number | null;
  maxPoints: number;
  correctCount: number;
  answeredCount: number;
  taskIds: string[];
  outcomes: SimulationArchiveOutcome[];
  historyEntry: SimulationHistoryEntry | null;
};

export function mergeSimulationArchive(
  local: readonly SimulationHistoryEntry[],
  remote: readonly SimulationArchiveRun[],
): SimulationArchiveRun[] {
  const merged = new Map(
    remote.map((entry) => [entry.id, cloneArchive(entry)]),
  );
  for (const entry of local) {
    const server = merged.get(entry.id);
    if (server === undefined || serverMatchesLocal(entry, server)) {
      merged.set(entry.id, archiveLocalEntry(entry));
    }
  }
  return [...merged.values()]
    .toSorted(
      (left, right) =>
        right.finishedAt - left.finishedAt || left.id.localeCompare(right.id),
    )
    .slice(0, SIMULATION_HISTORY_LIMIT);
}

function serverMatchesLocal(
  local: SimulationHistoryEntry,
  remote: SimulationArchiveRun,
): boolean {
  const server = remote.historyEntry;
  if (
    server === null ||
    local.id !== server.id ||
    local.blueprintVersion !== server.blueprintVersion ||
    local.startedAt !== server.startedAt ||
    local.finishedAt !== server.finishedAt ||
    local.durationMs !== server.durationMs ||
    local.timedOut !== server.timedOut ||
    local.score !== server.score ||
    local.maxPoints !== server.maxPoints ||
    local.correctCount !== server.correctCount ||
    local.answeredCount !== server.answeredCount ||
    !sameStrings(local.taskIds, server.taskIds) ||
    local.results.length !== server.results.length ||
    local.results.some((result, index) => {
      const stored = server.results[index];
      return (
        result.taskId !== stored.taskId ||
        result.outcome !== stored.outcome ||
        result.earnedPoints !== stored.earnedPoints ||
        result.maxPoints !== stored.maxPoints
      );
    }) ||
    !sameOptionalScores(local.rubricScores, server.rubricScores) ||
    local.answers.length !== server.answers.length ||
    local.answers.some(
      (answers, index) =>
        server.results[index].outcome !== "unanswered" &&
        !sameStrings(answers, server.answers[index]),
    )
  ) {
    return false;
  }

  const localSnapshot = local.progress;
  const serverSnapshot = server.archiveSnapshot;
  return (
    localSnapshot === undefined ||
    serverSnapshot === undefined ||
    (localSnapshot.contentRevision === serverSnapshot.contentRevision &&
      sameStrings(
        localSnapshot.items.map(({ taskRevision }) => taskRevision),
        serverSnapshot.taskRevisions,
      ))
  );
}

function sameOptionalScores(
  left: readonly (number | null)[] | undefined,
  right: readonly (number | null)[] | undefined,
): boolean {
  const leftScores = left ?? Array<null>(right?.length ?? 0).fill(null);
  const rightScores = right ?? Array<null>(leftScores.length).fill(null);
  return (
    leftScores.length === rightScores.length &&
    leftScores.every((score, index) => score === rightScores[index])
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function compatibleSimulationHistory(
  entries: readonly SimulationArchiveRun[],
): SimulationHistoryEntry[] {
  return entries.flatMap(({ historyEntry }) =>
    historyEntry === null ? [] : [historyEntry],
  );
}

export function simulationContentChanged(
  entry: SimulationHistoryEntry,
  currentContentRevision: string,
  tasks: readonly { revision: string }[],
): boolean {
  const contentRevision =
    entry.archiveSnapshot?.contentRevision ?? entry.progress?.contentRevision;
  const taskRevisions =
    entry.archiveSnapshot?.taskRevisions ??
    entry.progress?.items.map(({ taskRevision }) => taskRevision);
  if (contentRevision === undefined || taskRevisions === undefined)
    return false;
  return (
    contentRevision !== currentContentRevision ||
    taskRevisions.length !== tasks.length ||
    taskRevisions.some((revision, index) => revision !== tasks[index].revision)
  );
}

function archiveLocalEntry(
  entry: SimulationHistoryEntry,
): SimulationArchiveRun {
  return {
    id: entry.id,
    blueprintVersion: entry.blueprintVersion,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
    timedOut: entry.timedOut,
    score: entry.score,
    maxPoints: entry.maxPoints,
    correctCount: entry.correctCount,
    answeredCount: entry.answeredCount,
    taskIds: [...entry.taskIds],
    outcomes: entry.results.map(({ outcome }) => outcome),
    historyEntry: entry,
  };
}

function cloneArchive(entry: SimulationArchiveRun): SimulationArchiveRun {
  return {
    ...entry,
    taskIds: [...entry.taskIds],
    outcomes: [...entry.outcomes],
    historyEntry:
      entry.historyEntry === null
        ? null
        : {
            ...entry.historyEntry,
            taskIds: [...entry.historyEntry.taskIds],
            answers: entry.historyEntry.answers.map((answers) => [...answers]),
            results: entry.historyEntry.results.map((result) => ({
              ...result,
            })),
            ...(entry.historyEntry.rubricScores === undefined
              ? {}
              : {
                  rubricScores: entry.historyEntry.rubricScores.map(
                    (score) => score,
                  ),
                }),
            ...(entry.historyEntry.archiveSnapshot === undefined
              ? {}
              : {
                  archiveSnapshot: {
                    contentRevision:
                      entry.historyEntry.archiveSnapshot.contentRevision,
                    taskRevisions: [
                      ...entry.historyEntry.archiveSnapshot.taskRevisions,
                    ],
                  },
                }),
          },
  };
}
