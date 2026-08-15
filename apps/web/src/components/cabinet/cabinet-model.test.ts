import { describe, expect, it } from "vitest";
import type { HistoryAttempt } from "../../lib/history-journal";
import type { MappedAttempt } from "../../lib/prep-readiness";
import type { SimulationArchiveRun } from "../../lib/simulation-archive";
import {
  cabinetProgram,
  hasCabinetActivity,
  latestP1Mock,
  latestPracticeAttempt,
  selectCabinetPractice,
  summarizeCabinetPracticeResume,
  type CabinetTask,
} from "./cabinet-model";

const positions = [
  {
    number: 1,
    name: "Complex numbers",
    topicSlugs: ["complex"],
    taskCount: 5,
    correct: 0,
    total: 0,
    errors: 0,
    assistedCorrect: 0,
    readiness: 0,
    status: "untested" as const,
    lastAttemptAt: null,
  },
  {
    number: 3,
    name: "Equations",
    topicSlugs: ["exponential"],
    taskCount: 5,
    correct: 2,
    total: 3,
    errors: 1,
    assistedCorrect: 0,
    readiness: 67,
    status: "progressing" as const,
    lastAttemptAt: "2026-08-03T12:00:00.000Z",
  },
];

const tasks: CabinetTask[] = [
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `complex-${index + 1}`,
    slot: 1,
    topic: "complex",
    difficulty: 2,
    topicLabel: "Complex numbers",
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `exponential-${index + 1}`,
    slot: 3,
    topic: "exponential",
    difficulty: 3,
    topicLabel: "Exponential equations",
  })),
];

describe("cabinet model", () => {
  it("continues the position from the latest attempt with bounded real progress", () => {
    const attempts: MappedAttempt[] = [
      attempt("exponential-1", 3, true, "2026-08-01T12:00:00.000Z"),
      attempt("exponential-2", 3, false, "2026-08-02T12:00:00.000Z"),
      attempt("exponential-3", 3, true, "2026-08-03T12:00:00.000Z"),
    ];

    expect(selectCabinetPractice(positions, attempts, tasks)).toMatchObject({
      position: { number: 3 },
      completed: 3,
      target: 5,
      progress: 60,
      minutes: 25,
      difficulty: "exam",
    });
  });

  it("uses the highest-priority untested position without attempts", () => {
    expect(selectCabinetPractice(positions, [], tasks)?.position.number).toBe(
      1,
    );
  });

  it("summarizes an active practice run from its exact current task", () => {
    expect(
      summarizeCabinetPracticeResume(
        {
          currentTaskId: "exponential-3",
          completed: 2,
          total: 5,
        },
        tasks,
      ),
    ).toMatchObject({
      task: { id: "exponential-3", slot: 3 },
      completed: 2,
      total: 5,
      progress: 40,
      minutes: 15,
      difficulty: "exam",
    });
  });

  it("rejects inconsistent active practice summaries", () => {
    expect(
      summarizeCabinetPracticeResume(
        { currentTaskId: "missing", completed: 0, total: 5 },
        tasks,
      ),
    ).toBeNull();
    expect(
      summarizeCabinetPracticeResume(
        { currentTaskId: "complex-1", completed: 6, total: 5 },
        tasks,
      ),
    ).toBeNull();
  });

  it("selects only scored full-format P1 mock attempts", () => {
    const partial = simulationRun({
      id: "11111111-1111-4111-8111-111111111111",
      score: 30,
      maxPoints: 60,
      taskCount: 5,
      finishedAt: 3,
    });
    const awaitingReview = simulationRun({
      id: "22222222-2222-4222-8222-222222222222",
      score: null,
      maxPoints: 60,
      taskCount: 10,
      finishedAt: 2,
    });
    const full = simulationRun({
      id: "33333333-3333-4333-8333-333333333333",
      score: 42,
      maxPoints: 60,
      taskCount: 10,
      finishedAt: 1,
    });

    expect(
      latestP1Mock([partial, awaitingReview, full], {
        taskCount: 10,
        maxPoints: 60,
      }),
    ).toBe(full);
  });

  it("finds the latest practice result and recognizes all activity sources", () => {
    const diagnostic = history("diagnostic");
    const practice = history("practice");
    expect(latestPracticeAttempt([diagnostic, practice])).toBe(practice);
    expect(
      hasCabinetActivity({
        attempts: [],
        practice,
        mock: null,
        activeRun: false,
      }),
    ).toBe(true);
    expect(
      hasCabinetActivity({
        attempts: [],
        practice: null,
        mock: null,
        activeRun: false,
      }),
    ).toBe(false);
  });

  it("keeps official program names and extracts compact card codes", () => {
    expect(cabinetProgram("Računarstvo i automatika (E2)", 1)).toEqual({
      code: "E2",
      name: "Računarstvo i automatika (E2)",
    });
    expect(cabinetProgram("Mehatronika", 2)).toEqual({
      code: "M",
      name: "Mehatronika",
    });
  });
});

function attempt(
  taskId: string,
  position: number,
  correct: boolean,
  at: string,
): MappedAttempt {
  return {
    taskId,
    slot: position,
    position,
    correct,
    source: "practice",
    helpLevel: 0,
    at,
  };
}

function history(source: HistoryAttempt["source"]): HistoryAttempt {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    taskId: "complex-1",
    slot: 1,
    source,
    outcome: "correct",
    answers: ["1"],
    helpLevel: 0,
    at: "2026-08-03T12:00:00.000Z",
  };
}

function simulationRun({
  id,
  score,
  maxPoints,
  taskCount,
  finishedAt,
}: {
  id: string;
  score: number | null;
  maxPoints: number;
  taskCount: number;
  finishedAt: number;
}): SimulationArchiveRun {
  return {
    id,
    blueprintVersion: "2026.1",
    startedAt: 0,
    finishedAt,
    durationMs: 1,
    timedOut: false,
    score,
    maxPoints,
    correctCount: 0,
    answeredCount: 0,
    taskIds: Array.from({ length: taskCount }, (_, index) => `task-${index}`),
    outcomes: Array.from({ length: taskCount }, () => "unanswered"),
    historyEntry: null,
  };
}
