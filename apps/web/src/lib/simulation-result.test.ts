import { describe, expect, it } from "vitest";
import {
  buildSimulationResultSummary,
  formatExamDuration,
} from "./simulation-result";
import type {
  SimulationHistoryEntry,
  SimulationResultTaskView,
} from "./simulation-types";

const tasks = [1, 2, 3].map((position): SimulationResultTaskView => ({
  id: `task-${position}`,
  slot: position,
  examPosition: position,
  maxPoints: 6,
  topic: `topic-${position}`,
  topicName: `Topic ${position}`,
  statementHtml: "<p>Task</p>",
  fields: [{ kind: "value" }],
  correctAnswerHtml: "<p>2</p>",
  solutionHtml: "<p>Solution</p>",
}));

function entry(
  id: string,
  outcomes: Array<"correct" | "incorrect" | "unanswered">,
  score: number,
): SimulationHistoryEntry {
  const answeredCount = outcomes.filter(
    (outcome) => outcome !== "unanswered",
  ).length;
  return {
    id,
    blueprintVersion: "2026.1",
    startedAt: 1_000,
    finishedAt: 61_000,
    durationMs: 60_000,
    timedOut: false,
    score,
    maxPoints: 18,
    correctCount: outcomes.filter((outcome) => outcome === "correct").length,
    answeredCount,
    taskIds: tasks.map((task) => task.id),
    answers: outcomes.map((outcome) => [outcome === "unanswered" ? "" : "2"]),
    results: outcomes.map((outcome, index) => ({
      taskId: tasks[index].id,
      outcome,
      earnedPoints: outcome === "correct" ? 6 : 0,
      maxPoints: 6,
    })),
  };
}

describe("simulation result summary", () => {
  it("separates strong, weak and unanswered positions", () => {
    const current = entry(
      "5ff78318-3436-4b4e-99b8-77ef34366ad3",
      ["correct", "incorrect", "unanswered"],
      6,
    );
    const summary = buildSimulationResultSummary(current, [current], tasks);

    expect(summary).toMatchObject({
      complete: false,
      delta: null,
      strongPositions: [1],
      weakPositions: [2],
      unansweredPositions: [3],
      practiceTaskIds: ["task-2"],
    });
  });

  it("compares only complete attempts with the same scale", () => {
    const current = entry(
      "5ff78318-3436-4b4e-99b8-77ef34366ad3",
      ["correct", "correct", "incorrect"],
      12,
    );
    const previous = entry(
      "1ff78318-3436-4b4e-99b8-77ef34366ad3",
      ["correct", "incorrect", "incorrect"],
      6,
    );

    expect(
      buildSimulationResultSummary(current, [current, previous], tasks)?.delta,
    ).toBe(6);
    expect(formatExamDuration(91 * 60_000)).toBe("01:31");
  });
});
