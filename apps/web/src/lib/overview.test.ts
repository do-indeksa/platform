import { describe, expect, it } from "vitest";
import type { MappedAttempt } from "./prep-readiness";
import {
  selectOverviewTaskIds,
  type OverviewPosition,
  type OverviewTask,
} from "./overview";

const positions: OverviewPosition[] = [
  { number: 1, name: "A", topicSlugs: ["a"], taskCount: 3 },
  { number: 2, name: "B", topicSlugs: ["b"], taskCount: 3 },
];

const tasks: OverviewTask[] = [
  { id: "a-1", slot: 1, topic: "a", difficulty: 2 },
  { id: "a-2", slot: 1, topic: "a", difficulty: 3 },
  { id: "a-3", slot: 1, topic: "a", difficulty: 4 },
  { id: "b-1", slot: 2, topic: "b", difficulty: 2 },
  { id: "b-2", slot: 2, topic: "b", difficulty: 3 },
  { id: "b-3", slot: 2, topic: "b", difficulty: 4 },
];

describe("overview practice selection", () => {
  it("balances a set across selected positions", () => {
    expect(
      selectOverviewTaskIds({
        selectedPositions: [1, 2],
        difficulty: "all",
        count: 5,
        positions,
        tasks,
        attempts: [],
      }),
    ).toEqual(["a-1", "b-1", "a-2", "b-2", "a-3"]);
  });

  it("honours the requested difficulty band", () => {
    expect(
      selectOverviewTaskIds({
        selectedPositions: [1, 2],
        difficulty: "exam",
        count: 10,
        positions,
        tasks,
        attempts: [],
      }),
    ).toEqual(["a-2", "b-2"]);
  });

  it("prioritises an incorrect task, then unseen work", () => {
    const attempts: MappedAttempt[] = [
      attempt("a-1", true, "2026-08-08T12:00:00.000Z"),
      attempt("a-2", false, "2026-08-09T12:00:00.000Z"),
    ];

    expect(
      selectOverviewTaskIds({
        selectedPositions: [1],
        difficulty: "all",
        count: 3,
        positions,
        tasks,
        attempts,
      }),
    ).toEqual(["a-2", "a-3", "a-1"]);
  });

  it("requires at least one selected position", () => {
    expect(
      selectOverviewTaskIds({
        selectedPositions: [],
        difficulty: "all",
        count: 5,
        positions,
        tasks,
        attempts: [],
      }),
    ).toEqual([]);
  });

  it("does not duplicate tasks when future positions share a topic", () => {
    expect(
      selectOverviewTaskIds({
        selectedPositions: [1, 3],
        difficulty: "all",
        count: 10,
        positions: [
          ...positions,
          { number: 3, name: "A again", topicSlugs: ["a"], taskCount: 3 },
        ],
        tasks,
        attempts: [],
      }),
    ).toEqual(["a-1", "a-2", "a-3"]);
  });
});

function attempt(taskId: string, correct: boolean, at: string): MappedAttempt {
  return {
    taskId,
    slot: 1,
    position: 1,
    correct,
    source: "practice",
    helpLevel: 0,
    at,
  };
}
