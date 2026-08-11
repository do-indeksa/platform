import { EXAM_POINTS_MAX } from "./scoring";
import { SIMULATION_HISTORY_LIMIT } from "./simulation-history-persistence";
import type { SimulationArchiveRun } from "./simulation-archive";

export type SimulationScoreTrendPoint = {
  id: string;
  finishedAt: number;
  score: number;
};

export type SimulationScoreTrend = {
  points: SimulationScoreTrendPoint[];
  latest: number;
  best: number;
  delta: number | null;
  maxPoints: number;
};

export function buildSimulationScoreTrend(
  entries: readonly SimulationArchiveRun[],
): SimulationScoreTrend | null {
  const points = entries
    .flatMap((entry): SimulationScoreTrendPoint[] => {
      if (!isComparableP1Result(entry)) return [];
      return [
        { id: entry.id, finishedAt: entry.finishedAt, score: entry.score },
      ];
    })
    .toSorted(
      (left, right) =>
        left.finishedAt - right.finishedAt || left.id.localeCompare(right.id),
    )
    .slice(-SIMULATION_HISTORY_LIMIT);
  const latest = points.at(-1);
  if (latest === undefined) return null;
  const previous = points.at(-2);

  return {
    points,
    latest: latest.score,
    best: Math.max(...points.map(({ score }) => score)),
    delta: previous === undefined ? null : latest.score - previous.score,
    maxPoints: EXAM_POINTS_MAX,
  };
}

function isComparableP1Result(
  entry: SimulationArchiveRun,
): entry is SimulationArchiveRun & { score: number } {
  return (
    entry.score !== null &&
    Number.isInteger(entry.score) &&
    entry.score >= 0 &&
    entry.score <= EXAM_POINTS_MAX &&
    entry.maxPoints === EXAM_POINTS_MAX &&
    entry.taskIds.length > 0 &&
    entry.answeredCount === entry.taskIds.length &&
    Number.isFinite(entry.finishedAt) &&
    entry.finishedAt > 0
  );
}
