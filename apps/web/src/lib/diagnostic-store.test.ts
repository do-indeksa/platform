import { beforeEach, describe, expect, it } from "vitest";
import {
  migrateDiagnosticState,
  parsePersistedDiagnosticState,
  reconcileDiagnosticOwner,
  syncDiagnosticOwner,
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
const userA = "a0209703-275b-4c6e-b815-25025b923ae8";
const userB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    runId,
    runOwnerId: null,
    checkpointVersion: 0,
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
  beforeEach(() => {
    useDiagnostic.getState().reset();
    syncDiagnosticOwner(null);
  });

  it("starts a resumable run without storing task content or expected answers", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    useDiagnostic.getState().setAnswer(0, 0, "1");

    expect(useDiagnostic.getState()).toMatchObject({
      runId,
      runOwnerId: null,
      checkpointVersion: 0,
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

  it("claims guest work and clears it on logout or an account switch", () => {
    const guest = parsePersistedDiagnosticState(persisted());
    const claimed = reconcileDiagnosticOwner(guest, userA);

    expect(claimed).toMatchObject({
      ownerId: userA,
      runtime: { phase: "running", runOwnerId: userA },
    });
    expect(
      reconcileDiagnosticOwner(claimed.runtime, userB).runtime,
    ).toMatchObject({ phase: null, runId: null });
    expect(
      reconcileDiagnosticOwner(claimed.runtime, null).runtime,
    ).toMatchObject({ phase: null, runId: null });
    expect(
      reconcileDiagnosticOwner(claimed.runtime, "not-a-user-id").runtime,
    ).toMatchObject({ phase: null, runId: null });
  });

  it("fails closed when migrating an unowned legacy runtime", () => {
    expect(migrateDiagnosticState(persisted(), 1)).toMatchObject({
      phase: null,
      runId: null,
    });
  });

  it("preserves an owner-scoped version-two runtime with version zero", () => {
    const { checkpointVersion, ...legacy } = persisted({
      runOwnerId: userA,
    });
    expect(checkpointVersion).toBe(0);

    expect(migrateDiagnosticState(legacy, 2)).toMatchObject({
      phase: "running",
      runOwnerId: userA,
      checkpointVersion: 0,
    });
  });

  it("adopts a server version and forks a conflicting run explicitly", () => {
    syncDiagnosticOwner(userA);
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });

    expect(useDiagnostic.getState().adoptCheckpointVersion(runId, 4)).toBe(
      true,
    );
    expect(useDiagnostic.getState().adoptCheckpointVersion(runId, 3)).toBe(
      false,
    );
    const forkedId = crypto.randomUUID();
    expect(useDiagnostic.getState().fork(forkedId)).toBe(true);
    expect(useDiagnostic.getState()).toMatchObject({
      runId: forkedId,
      checkpointVersion: 0,
      phase: "running",
    });
  });

  it("reconciles the live store before exposing another account", () => {
    useDiagnostic.getState().start({ runId, taskIds, slots, answerPartCounts });
    syncDiagnosticOwner(userA);
    useDiagnostic.getState().setAnswer(0, 0, "private answer");

    expect(useDiagnostic.getState()).toMatchObject({
      runOwnerId: userA,
      answers: [["private answer", ""], ...Array(9).fill([""])],
    });
    syncDiagnosticOwner(userB);
    expect(useDiagnostic.getState()).toMatchObject({
      authOwnerId: userB,
      phase: null,
      runId: null,
      answers: [],
    });
  });

  it.each([
    persisted({ runId: "bad" }),
    persisted({ runOwnerId: "bad" }),
    persisted({ checkpointVersion: -1 }),
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
