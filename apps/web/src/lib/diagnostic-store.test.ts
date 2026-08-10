import { beforeEach, describe, expect, it } from "vitest";
import {
  parsePersistedDiagnosticState,
  useDiagnostic,
} from "./diagnostic-store";
import { MAX_TASK_ANSWER_PARTS } from "./task-draft";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const taskIds = [
  "kb-001",
  "kv-001",
  "eks-001",
  "log-001",
  "trig-001",
  "vek-001",
  "plan-001",
  "ster-001",
  "fun-001",
  "komb-001",
];
const slots = [1, 2, 4, 3, 5, 6, 7, 8, 9, 10];
const answerPartCounts = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1];

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    runId,
    taskIds,
    slots,
    answers: answerPartCounts.map((count) => Array(count).fill("")),
    outcomes: Array(10).fill(null),
    completedAt: Array(10).fill(null),
    phase: "running",
    currentIndex: 0,
    startedAt: Date.UTC(2026, 7, 10),
    ...overrides,
  };
}

describe("diagnostic persistence", () => {
  beforeEach(() => useDiagnostic.getState().reset());

  it("starts a resumable run without storing task content or expected answers", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    useDiagnostic.getState().setAnswer(0, 0, "1");

    expect(useDiagnostic.getState()).toMatchObject({
      runId,
      taskIds,
      slots,
      answers: [["1", ""], ...answerPartCounts.slice(1).map(() => [""])],
      phase: "running",
      currentIndex: 0,
      completedAt: Array(10).fill(null),
    });
    expect(useDiagnostic.getState()).not.toHaveProperty("tasks");
  });

  it("does not replace a different active run", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    useDiagnostic.getState().start({
      runId: crypto.randomUUID(),
      taskIds: taskIds.toReversed(),
      slots: slots.toReversed(),
      answerPartCounts,
    });

    expect(useDiagnostic.getState().runId).toBe(runId);
  });

  it("keeps skipped work separate from incorrect work", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    useDiagnostic.getState().completeCurrent(taskIds[0], "correct");
    useDiagnostic.getState().completeCurrent(taskIds[1], "incorrect");
    for (let index = 2; index < 10; index++) {
      useDiagnostic.getState().completeCurrent(taskIds[index], "skipped");
    }

    expect(useDiagnostic.getState()).toMatchObject({
      phase: "done",
      currentIndex: 9,
      outcomes: [
        "correct",
        "incorrect",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
      ],
    });
    expect(useDiagnostic.getState().completedAt.every(Number.isInteger)).toBe(
      true,
    );

    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    expect(useDiagnostic.getState().phase).toBe("done");
  });

  it("ignores a repeated completion event from the previous task", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    useDiagnostic.getState().completeCurrent(taskIds[0], "skipped");
    useDiagnostic.getState().completeCurrent(taskIds[0], "skipped");

    expect(useDiagnostic.getState()).toMatchObject({
      currentIndex: 1,
      outcomes: [
        "skipped",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    });
  });

  it("restores a valid task at the shared answer-part limit", () => {
    const answers = answerPartCounts.map((count) => Array(count).fill(""));
    answers[0] = Array(MAX_TASK_ANSWER_PARTS).fill("");

    expect(parsePersistedDiagnosticState(persisted({ answers }))).toMatchObject(
      {
        phase: "running",
        answers,
      },
    );
  });

  it("migrates completion times missing from a legacy active run", () => {
    const value = persisted({
      outcomes: ["correct", ...Array(9).fill(null)],
      currentIndex: 1,
    });
    const legacy = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "completedAt"),
    );

    expect(parsePersistedDiagnosticState(legacy).completedAt).toEqual([
      value.startedAt,
      ...Array(9).fill(null),
    ]);
  });

  it("rejects mismatched or decreasing completion times", () => {
    const startedAt = Date.UTC(2026, 7, 10);
    const active = persisted({
      outcomes: ["correct", "incorrect", ...Array(8).fill(null)],
      currentIndex: 2,
    });

    expect(
      parsePersistedDiagnosticState({
        ...active,
        completedAt: [startedAt + 1, null, ...Array(8).fill(null)],
      }).phase,
    ).toBeNull();
    expect(
      parsePersistedDiagnosticState({
        ...active,
        completedAt: [startedAt + 2, startedAt + 1, ...Array(8).fill(null)],
      }).phase,
    ).toBeNull();
  });

  it("rejects a task above the shared answer-part limit", () => {
    const answers = answerPartCounts.map((count) => Array(count).fill(""));
    answers[0] = Array(MAX_TASK_ANSWER_PARTS + 1).fill("");

    expect(
      parsePersistedDiagnosticState(persisted({ answers })).phase,
    ).toBeNull();
  });

  it.each([
    persisted({ runId: "bad" }),
    persisted({ taskIds: taskIds.with(1, "kb-001") }),
    persisted({ slots: slots.with(1, 1) }),
    persisted({ answers: [["1"]] }),
    persisted({ outcomes: ["correct", ...Array(9).fill(null)] }),
    persisted({ phase: "done" }),
    persisted({ phase: "done", outcomes: Array(10).fill("skipped") }),
  ])("resets malformed or internally inconsistent state", (value) => {
    expect(parsePersistedDiagnosticState(value).phase).toBeNull();
  });
});
