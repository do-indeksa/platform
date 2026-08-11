import { describe, expect, it } from "vitest";
import { parseSimulationArchiveResponse } from "./simulation-archive-parser";

const RUN_ID = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const REVISION_A = `sha256:${"a".repeat(64)}`;
const REVISION_B = `sha256:${"b".repeat(64)}`;

function item(position: number, overrides: Record<string, unknown> = {}) {
  return {
    taskId: `task-${position}`,
    examPosition: position,
    topic: `topic-${position}`,
    maxPoints: 6,
    taskRevision: REVISION_B,
    answer: JSON.stringify([String(position)]),
    outcome: "INCORRECT",
    earnedPoints: 0,
    ...overrides,
  };
}

function response(
  items = [
    item(1),
    item(2, { answer: null, outcome: "SKIPPED", earnedPoints: null }),
  ],
) {
  return {
    data: {
      completedSimulationRuns: [
        {
          id: RUN_ID,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: REVISION_A,
          startedAt: "2026-08-10T10:00:00.000Z",
          deadlineAt: "2026-08-10T10:10:00.000Z",
          submittedAt: "2026-08-10T10:10:00.000Z",
          activeDurationMs: 600_000,
          items,
        },
      ],
    },
  };
}

describe("simulation archive parser", () => {
  it("reconstructs a binary result and preserves its immutable revisions", () => {
    const parsed = parseSimulationArchiveResponse(response(), 20);

    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]).toMatchObject({
      id: RUN_ID,
      blueprintVersion: "2026.1",
      durationMs: 600_000,
      timedOut: true,
      score: 0,
      maxPoints: 12,
      correctCount: 0,
      answeredCount: 1,
      taskIds: ["task-1", "task-2"],
      outcomes: ["incorrect", "unanswered"],
    });
    expect(parsed?.[0].historyEntry).toMatchObject({
      answers: [["1"], [""]],
      results: [
        { taskId: "task-1", outcome: "incorrect", earnedPoints: 0 },
        { taskId: "task-2", outcome: "unanswered", earnedPoints: 0 },
      ],
      archiveSnapshot: {
        contentRevision: REVISION_A,
        taskRevisions: [REVISION_B, REVISION_B],
      },
    });
  });

  it("shows partial and ungraded runs without inventing a reviewable score", () => {
    const parsed = parseSimulationArchiveResponse(
      response([
        item(1, { outcome: "PARTIAL", earnedPoints: 3 }),
        item(2, { outcome: "UNGRADED", earnedPoints: null }),
      ]),
      20,
    );

    expect(parsed?.[0]).toMatchObject({
      score: null,
      maxPoints: 12,
      answeredCount: 2,
      outcomes: ["partial", "ungraded"],
      historyEntry: null,
    });
  });

  it("keeps valid sparse binary attempts visible without inventing answers", () => {
    const parsed = parseSimulationArchiveResponse(
      response([
        item(1, { answer: null, outcome: "CORRECT", earnedPoints: null }),
      ]),
      20,
    );

    expect(parsed?.[0]).toMatchObject({
      score: 6,
      correctCount: 1,
      historyEntry: null,
    });
  });

  it("rejects malformed answers, impossible points, duplicate ids, and overflow", () => {
    expect(
      parseSimulationArchiveResponse(
        response([item(1, { answer: "not-json" })]),
        20,
      ),
    ).toBeNull();
    expect(
      parseSimulationArchiveResponse(
        response([item(1, { outcome: "CORRECT", earnedPoints: 0 })]),
        20,
      ),
    ).toBeNull();

    const duplicate = response();
    duplicate.data.completedSimulationRuns.push(
      structuredClone(duplicate.data.completedSimulationRuns[0]),
    );
    expect(parseSimulationArchiveResponse(duplicate, 20)).toBeNull();
    expect(parseSimulationArchiveResponse(response(), 0)).toBeNull();
  });
});
