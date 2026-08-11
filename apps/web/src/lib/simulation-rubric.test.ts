import { describe, expect, it } from "vitest";
import {
  applySimulationRubric,
  simulationRubricIndexes,
} from "./simulation-rubric";
import type {
  SimulationGradeItem,
  SimulationReviewItem,
} from "./simulation-types";

const results: SimulationGradeItem[] = [
  {
    taskId: "kb-001",
    outcome: "correct",
    earnedPoints: 6,
    maxPoints: 6,
  },
  {
    taskId: "kv-001",
    outcome: "incorrect",
    earnedPoints: 0,
    maxPoints: 6,
  },
  {
    taskId: "log-001",
    outcome: "unanswered",
    earnedPoints: 0,
    maxPoints: 6,
  },
  {
    taskId: "eks-001",
    outcome: "incorrect",
    earnedPoints: 0,
    maxPoints: 6,
  },
];

const rubric = [
  { id: "model", points: 2, text: "Model" },
  { id: "work", points: 2, text: "Work" },
  { id: "check", points: 1, text: "Check" },
];
const review: SimulationReviewItem[] = results.map((result, index) => ({
  taskId: result.taskId,
  correctAnswer: "42",
  solution: "Solution",
  rubric: index === 3 ? [] : rubric,
}));

describe("simulation rubric", () => {
  it("selects only non-correct tasks with reviewed criteria", () => {
    expect(simulationRubricIndexes(results, review)).toEqual([1, 2]);
  });

  it("keeps zero, awards bounded partial points, and preserves auto scores", () => {
    expect(applySimulationRubric(results, review, [null, 4, 0, null])).toEqual([
      results[0],
      { ...results[1], outcome: "partial", earnedPoints: 4 },
      results[2],
      results[3],
    ]);
  });

  it.each([
    ["missing decision", [null, null, 0, null]],
    ["full manual score", [null, 6, 0, null]],
    ["manual correct override", [1, 0, 0, null]],
    ["unreviewed task override", [null, 0, 0, 1]],
  ])("rejects %s", (_name, scores) => {
    expect(applySimulationRubric(results, review, scores)).toBeNull();
  });
});
