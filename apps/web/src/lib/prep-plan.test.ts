import { describe, expect, it } from "vitest";
import type { TaskReference } from "@/lib/content";
import type { Attempt } from "@/lib/knowledge";
import {
  buildPrepPlan,
  mapAttemptsToPositions,
  PREP_ASSISTED_CORRECT_WEIGHT,
  prepPracticeTaskCount,
  type PrepPositionDefinition,
} from "./prep-plan";

const dayStartMs = Date.parse("2026-08-10T00:00:00.000Z");
const dayEndMs = Date.parse("2026-08-11T00:00:00.000Z");

const positions: PrepPositionDefinition[] = [
  { number: 1, name: "Complex numbers", topicSlugs: ["complex"] },
  { number: 2, name: "Quadratics", topicSlugs: ["quadratic"] },
  { number: 3, name: "Exponentials", topicSlugs: ["exponential"] },
  { number: 4, name: "Logarithms", topicSlugs: ["logarithms"] },
];

const topicSlots = [
  { slug: "complex", slot: 1 },
  { slug: "quadratic", slot: 2 },
  { slug: "logarithms", slot: 3 },
  { slug: "exponential", slot: 4 },
];

const taskReferences: TaskReference[] = positions.flatMap((position) =>
  position.topicSlugs.flatMap((topic) =>
    [1, 2, 3].map((index) => ({
      id: `${topic}-${index}`,
      slot: topicSlots.find((candidate) => candidate.slug === topic)?.slot ?? 1,
      topic,
    })),
  ),
);

function attempt(taskId: string, overrides: Partial<Attempt> = {}): Attempt {
  const reference = taskReferences.find((task) => task.id === taskId);
  return {
    taskId,
    slot: reference?.slot ?? 1,
    correct: true,
    source: "practice",
    helpLevel: 0,
    at: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

function plan(attempts: Attempt[], settingsComplete = false) {
  return buildPrepPlan({
    attempts,
    positions,
    topicSlots,
    taskReferences,
    dayStartMs,
    dayEndMs,
    settingsComplete,
  });
}

describe("prep plan", () => {
  it("uses goal and exam date to choose a realistic practice volume", () => {
    expect(
      prepPracticeTaskCount({
        goalPoints: 30,
        maxPoints: 60,
        daysUntilExam: 90,
      }),
    ).toBe(3);
    expect(
      prepPracticeTaskCount({
        goalPoints: 48,
        maxPoints: 60,
        daysUntilExam: 90,
      }),
    ).toBe(5);
    expect(
      prepPracticeTaskCount({
        goalPoints: 30,
        maxPoints: 60,
        daysUntilExam: 30,
      }),
    ).toBe(5);
    expect(
      prepPracticeTaskCount({
        goalPoints: 30,
        maxPoints: 60,
        daysUntilExam: -1,
      }),
    ).toBe(3);
  });

  it("maps task topics to current exam positions instead of stale topic slots", () => {
    const mapped = mapAttemptsToPositions(
      [attempt("exponential-1"), attempt("logarithms-1")],
      positions,
      topicSlots,
      taskReferences,
    );

    expect(mapped.map(({ position }) => position)).toEqual([3, 4]);
  });

  it("uses confidence and hint assistance in the readiness score", () => {
    const result = plan([
      attempt("complex-1"),
      attempt("complex-2", { helpLevel: 1 }),
    ]);
    const position = result.positions[0];

    expect(position.readiness).toBe(
      Math.round(((1 + PREP_ASSISTED_CORRECT_WEIGHT) / 3) * 100),
    );
    expect(position.status).toBe("starting");
    expect(result.readiness).toBe(Math.round(position.readiness / 4));
  });

  it("starts an empty journal with a diagnostic and never returns an empty day", () => {
    const result = plan([]);

    expect(result.nextAction).toMatchObject({
      kind: "diagnostic",
      reason: "noData",
      count: positions.length,
      completed: false,
    });
    expect(result.todayActions.map(({ kind }) => kind)).toEqual([
      "diagnostic",
      "practice",
      "settings",
    ]);
  });

  it("requests a baseline when practice exists without a diagnostic", () => {
    const result = plan([attempt("complex-1", { correct: false })]);

    expect(result.nextAction).toMatchObject({
      kind: "diagnostic",
      reason: "missingBaseline",
    });
  });

  it("turns diagnostic errors into a focused, explainable practice set", () => {
    const result = plan([
      attempt("complex-1", { source: "diagnostic" }),
      attempt("quadratic-1", { source: "diagnostic", correct: false }),
      attempt("exponential-1", { source: "diagnostic" }),
      attempt("logarithms-1", { source: "diagnostic" }),
    ]);

    expect(result.nextAction).toMatchObject({
      kind: "practice",
      position: 2,
      reason: "errors",
      reasonCount: 1,
      taskIds: ["quadratic-1", "quadratic-2", "quadratic-3"],
    });
  });

  it.each([Number.NaN, -10, 1, 99])(
    "bounds practice volume %s before selecting tasks",
    (practiceTaskCount) => {
      const result = buildPrepPlan({
        attempts: [
          attempt("complex-1", { source: "diagnostic", correct: false }),
        ],
        positions,
        topicSlots,
        taskReferences,
        dayStartMs,
        dayEndMs,
        settingsComplete: false,
        practiceTaskCount,
      });

      expectBoundedTaskAction(result.nextAction ?? undefined, taskReferences);
    },
  );

  it.each([1, 2])(
    "pads a %i-error review into one bounded immutable task session",
    (errorCount) => {
      const reviewErrors = ["quadratic-1", "exponential-1"].slice(
        0,
        errorCount,
      );
      const result = plan([
        attempt("complex-1", { source: "diagnostic", correct: false }),
        ...reviewErrors.map((taskId) =>
          attempt(taskId, { source: "diagnostic", correct: false }),
        ),
        attempt("logarithms-1", { source: "diagnostic" }),
      ]);
      const review = result.todayActions.find(
        (action) => action.kind === "review",
      );

      expect(review).toMatchObject({
        reason: "recentErrors",
        reasonCount: errorCount,
      });
      expect(review?.taskIds.slice(0, errorCount)).toEqual(reviewErrors);
      expectBoundedTaskAction(review, taskReferences);
      expect(
        review?.taskIds.every(
          (taskId) => !result.todayActions[0].taskIds.includes(taskId),
        ),
      ).toBe(true);
    },
  );

  it("keeps every task recommendation inside the shared session bounds", () => {
    const result = buildPrepPlan({
      attempts: positions.flatMap((position) =>
        [1, 2, 3].map((index) =>
          attempt(`${position.topicSlugs[0]}-${index}`, {
            source: "diagnostic",
          }),
        ),
      ),
      positions,
      topicSlots,
      taskReferences,
      dayStartMs,
      dayEndMs,
      settingsComplete: true,
      practiceTaskCount: 99,
    });

    for (const action of result.todayActions) {
      if (["practice", "review", "check"].includes(action.kind)) {
        expectBoundedTaskAction(action, taskReferences);
      }
    }
  });

  it("keeps the morning plan stable and marks returned actions complete", () => {
    const baseline = [
      attempt("complex-1", { source: "diagnostic" }),
      attempt("quadratic-1", { source: "diagnostic", correct: false }),
      attempt("exponential-1", { source: "diagnostic" }),
      attempt("logarithms-1", { source: "diagnostic" }),
    ];
    const today = [1, 2, 3].map((index) =>
      attempt(`quadratic-${index}`, {
        at: `2026-08-10T10:0${index}:00.000Z`,
      }),
    );
    const result = plan([...baseline, ...today], true);

    expect(result.todayActions[0]).toMatchObject({
      id: "practice-2",
      completed: true,
    });
    expect(result.todayActions.at(-1)).toMatchObject({
      kind: "settings",
      completed: true,
    });
    expect(result.nextAction?.id).not.toBe("practice-2");
  });

  it("counts an all-skipped diagnostic as complete when the run store confirms it", () => {
    const result = buildPrepPlan({
      attempts: [],
      positions,
      topicSlots,
      taskReferences,
      dayStartMs,
      dayEndMs,
      settingsComplete: false,
      diagnosticCompleted: true,
      diagnosticCompletedToday: true,
    });

    expect(result.todayActions[0]).toMatchObject({
      kind: "diagnostic",
      completed: true,
    });
    expect(result.nextAction).toMatchObject({
      kind: "practice",
      position: 1,
      reason: "untested",
    });
  });

  it("uses a diagnostic completed today immediately, then freezes its focus", () => {
    const todayDiagnostic = [
      attempt("complex-1", {
        source: "diagnostic",
        at: "2026-08-10T09:00:00.000Z",
      }),
      attempt("quadratic-1", {
        source: "diagnostic",
        correct: false,
        at: "2026-08-10T09:01:00.000Z",
      }),
    ];
    const result = buildPrepPlan({
      attempts: todayDiagnostic,
      positions,
      topicSlots,
      taskReferences,
      dayStartMs,
      dayEndMs,
      settingsComplete: false,
      diagnosticCompleted: true,
      diagnosticCompletedToday: true,
    });

    expect(result.todayActions[0]).toMatchObject({
      kind: "diagnostic",
      completed: true,
    });
    expect(result.nextAction).toMatchObject({
      kind: "practice",
      position: 2,
      reason: "errors",
    });
  });

  it("keeps a prior all-skipped diagnostic without duplicating practice sets", () => {
    const result = buildPrepPlan({
      attempts: [],
      positions,
      topicSlots,
      taskReferences,
      dayStartMs,
      dayEndMs,
      settingsComplete: false,
      diagnosticCompleted: true,
    });

    expect(
      result.todayActions.slice(0, 2).map(({ kind, position }) => ({
        kind,
        position,
      })),
    ).toEqual([
      { kind: "practice", position: 1 },
      { kind: "practice", position: 2 },
    ]);
  });

  it("refreshes the stalest confident position after a week", () => {
    const oldAttempts = positions.flatMap((position) =>
      [1, 2, 3].map((index) =>
        attempt(`${position.topicSlugs[0]}-${index}`, {
          source: "diagnostic",
          at: `2026-07-30T10:0${index}:00.000Z`,
        }),
      ),
    );
    const result = plan(oldAttempts);

    expect(result.nextAction).toMatchObject({
      kind: "practice",
      position: 1,
      reason: "stale",
    });
  });
});

function expectBoundedTaskAction(
  action: ReturnType<typeof plan>["todayActions"][number] | undefined,
  catalog: readonly TaskReference[],
): void {
  expect(action).toBeDefined();
  if (!action) return;

  expect(action.taskIds.length).toBeGreaterThanOrEqual(3);
  expect(action.taskIds.length).toBeLessThanOrEqual(5);
  expect(new Set(action.taskIds).size).toBe(action.taskIds.length);
  expect(action.count).toBe(action.taskIds.length);
  expect(action.minutes).toBe(action.taskIds.length * 5);
  expect(action.minutes).toBeGreaterThanOrEqual(15);
  expect(action.minutes).toBeLessThanOrEqual(25);
  expect(
    action.taskIds.every((taskId) =>
      catalog.some((candidate) => candidate.id === taskId),
    ),
  ).toBe(true);
}
