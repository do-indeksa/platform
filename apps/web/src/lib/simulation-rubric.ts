import type {
  SimulationGradeItem,
  SimulationReviewItem,
} from "./simulation-types";

export function simulationRubricIndexes(
  results: readonly SimulationGradeItem[],
  review: readonly SimulationReviewItem[],
): number[] {
  if (!sameComposition(results, review)) return [];
  return results.flatMap((result, index) =>
    result.outcome !== "correct" && review[index].rubric.length > 0
      ? [index]
      : [],
  );
}

export function applySimulationRubric(
  results: readonly SimulationGradeItem[],
  review: readonly SimulationReviewItem[],
  scores: readonly (number | null)[],
): SimulationGradeItem[] | null {
  const normalized = normalizeSimulationRubricScores(
    results,
    review,
    scores,
    true,
  );
  if (normalized === null) return null;
  const final: SimulationGradeItem[] = [];
  for (const [index, result] of results.entries()) {
    const rubricMax = review[index].rubric.reduce(
      (sum, criterion) => sum + criterion.points,
      0,
    );
    const score = normalized[index];
    const eligible = result.outcome !== "correct" && rubricMax > 0;
    if (!eligible) {
      final.push({ ...result });
      continue;
    }
    if (score === null) return null;
    final.push(
      score === 0
        ? { ...result }
        : { ...result, outcome: "partial", earnedPoints: score },
    );
  }
  return final;
}

export function normalizeSimulationRubricScores(
  results: readonly SimulationGradeItem[],
  review: readonly SimulationReviewItem[],
  scores: unknown,
  requireComplete = false,
): (number | null)[] | null {
  if (
    !sameComposition(results, review) ||
    !Array.isArray(scores) ||
    scores.length !== results.length
  ) {
    return null;
  }
  const normalized: (number | null)[] = [];
  for (const [index, result] of results.entries()) {
    const rubricMax = review[index].rubric.reduce(
      (sum, criterion) => sum + criterion.points,
      0,
    );
    const eligible = result.outcome !== "correct" && rubricMax > 0;
    const score = scores[index];
    if (!eligible) {
      if (score !== null) return null;
      normalized.push(null);
      continue;
    }
    if (score === null && !requireComplete) {
      normalized.push(null);
      continue;
    }
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > rubricMax ||
      rubricMax >= result.maxPoints
    ) {
      return null;
    }
    normalized.push(score);
  }
  return normalized;
}

function sameComposition(
  results: readonly SimulationGradeItem[],
  review: readonly SimulationReviewItem[],
): boolean {
  return (
    results.length > 0 &&
    results.length === review.length &&
    results.every((result, index) => result.taskId === review[index].taskId)
  );
}
