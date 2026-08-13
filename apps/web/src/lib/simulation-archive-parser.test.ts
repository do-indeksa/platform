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
    gradingKind: "AUTO",
    earnedPoints: 0,
    ...overrides,
  };
}

function response(
  items = completeItems({
    2: { answer: null, outcome: "SKIPPED", earnedPoints: null },
  }),
): {
  data: {
    completedSimulationRuns: Array<{
      id: string;
      blueprintVersion: string;
      contentRevision: string;
      startedAt: string;
      deadlineAt: string | null;
      submittedAt: string;
      activeDurationMs: number;
      items: ReturnType<typeof item>[];
    }>;
  };
} {
  return {
    data: {
      completedSimulationRuns: [
        {
          id: RUN_ID,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: REVISION_A,
          startedAt: "2026-08-10T10:00:00.000Z",
          deadlineAt: "2026-08-10T14:00:00.000Z",
          submittedAt: "2026-08-10T10:10:00.000Z",
          activeDurationMs: 600_000,
          items,
        },
      ],
    },
  };
}

function completeItems(
  overrides: Record<number, Record<string, unknown>> = {},
) {
  return Array.from({ length: 10 }, (_, index) =>
    item(index + 1, overrides[index + 1]),
  );
}

describe("simulation archive parser", () => {
  it("reconstructs a binary result and preserves its immutable revisions", () => {
    const parsed = parseSimulationArchiveResponse(response(), 20);

    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]).toMatchObject({
      id: RUN_ID,
      blueprintVersion: "2026.1",
      durationMs: 600_000,
      timedOut: false,
      score: 0,
      maxPoints: 60,
      correctCount: 0,
      answeredCount: 9,
      taskIds: Array.from({ length: 10 }, (_, index) => `task-${index + 1}`),
    });
    expect(parsed?.[0].historyEntry).toMatchObject({
      archiveSnapshot: {
        contentRevision: REVISION_A,
        taskRevisions: Array(10).fill(REVISION_B),
      },
    });
    expect(parsed?.[0].historyEntry?.answers.slice(0, 2)).toEqual([
      ["1"],
      [""],
    ]);
    expect(parsed?.[0].historyEntry?.results.slice(0, 2)).toMatchObject([
      { taskId: "task-1", outcome: "incorrect", earnedPoints: 0 },
      { taskId: "task-2", outcome: "unanswered", earnedPoints: 0 },
    ]);
  });

  it("shows partial and ungraded runs without inventing a reviewable score", () => {
    const parsed = parseSimulationArchiveResponse(
      response(
        completeItems({
          1: {
            outcome: "PARTIAL",
            gradingKind: "RUBRIC_SELF",
            earnedPoints: 3,
          },
          2: { outcome: "UNGRADED", earnedPoints: null },
        }),
      ),
      20,
    );

    expect(parsed?.[0]).toMatchObject({
      score: null,
      maxPoints: 60,
      answeredCount: 10,
      historyEntry: null,
    });
    expect(parsed?.[0].outcomes.slice(0, 2)).toEqual(["partial", "ungraded"]);
  });

  it("reconstructs self-assessed partial and zero-point rubric results", () => {
    const parsed = parseSimulationArchiveResponse(
      response(
        completeItems({
          1: {
            outcome: "PARTIAL",
            gradingKind: "RUBRIC_SELF",
            earnedPoints: 3,
          },
          2: { gradingKind: "RUBRIC_SELF" },
        }),
      ),
      20,
    );

    expect(parsed?.[0]).toMatchObject({
      score: 3,
      historyEntry: {
        score: 3,
      },
    });
    expect(parsed?.[0].outcomes.slice(0, 2)).toEqual(["partial", "incorrect"]);
    expect(parsed?.[0].historyEntry?.rubricScores?.slice(0, 2)).toEqual([3, 0]);
    expect(parsed?.[0].historyEntry?.results.slice(0, 2)).toMatchObject([
      { outcome: "partial", earnedPoints: 3 },
      { outcome: "incorrect", earnedPoints: 0 },
    ]);
  });

  it("keeps valid sparse binary attempts visible without inventing answers", () => {
    const parsed = parseSimulationArchiveResponse(
      response(
        completeItems({
          1: { answer: null, outcome: "CORRECT", earnedPoints: null },
        }),
      ),
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
        response(completeItems({ 1: { answer: "not-json" } })),
        20,
      ),
    ).toBeNull();
    expect(
      parseSimulationArchiveResponse(
        response(completeItems({ 1: { outcome: "CORRECT", earnedPoints: 0 } })),
        20,
      ),
    ).toBeNull();
    expect(
      parseSimulationArchiveResponse(
        response(completeItems({ 1: { gradingKind: "HUMAN" } })),
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

  it("rejects incomplete, non-60-point, and non-canonical archive snapshots", () => {
    expect(
      parseSimulationArchiveResponse(response(completeItems().slice(0, 9)), 20),
    ).toBeNull();
    expect(
      parseSimulationArchiveResponse(
        response(completeItems({ 1: { maxPoints: 5 } })),
        20,
      ),
    ).toBeNull();
    const wrongDeadline = response();
    wrongDeadline.data.completedSimulationRuns[0].deadlineAt =
      "2026-08-10T13:59:59.000Z";
    expect(parseSimulationArchiveResponse(wrongDeadline, 20)).toBeNull();
  });

  it("derives the canonical deadline for a complete legacy archive row", () => {
    const legacy = response();
    legacy.data.completedSimulationRuns[0].deadlineAt = null;

    expect(parseSimulationArchiveResponse(legacy, 20)?.[0]).toMatchObject({
      timedOut: false,
      historyEntry: { timedOut: false },
    });
  });
});
