import { describe, expect, it } from "vitest";
import type { PracticeCloudCatalog } from "./practice-cloud-types";
import {
  practiceRuntimeResumeHref,
  selectPracticeRuntimeResume,
} from "./practice-runtime-resume";
import type { PersistedPracticeRun } from "./practice-runtime-types";

const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const otherOwner = "4f7d3dde-1a41-4d93-83c2-7b7e97367e86";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const newerRunId = "6ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const catalog: PracticeCloudCatalog = {
  blueprintVersion: "ftn-p1:2026.1",
  tasks: [
    {
      id: "kb-001",
      revision: revision("a"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 1,
    },
    {
      id: "kv-001",
      revision: revision("b"),
      slot: 2,
      topic: "kvadratne-jednacine",
      answerPartCount: 2,
    },
  ],
};

describe("practice runtime resume", () => {
  it("selects the newest current owner run despite later sync metadata", () => {
    const older = activeRun(runId, { updatedAt: startedAt + 10_000 });
    const newer = activeRun(newerRunId, {
      startedAt: startedAt + 1_000,
      updatedAt: startedAt + 2_000,
      currentIndex: 1,
      activeDurationMs: 90_000,
    });
    newer.items[0].attempts.push(attempt("correct"));
    newer.items[1].attempts.push(attempt("incorrect"));

    expect(
      selectPracticeRuntimeResume([older, newer], ownerId, catalog),
    ).toEqual({
      runId: newerRunId,
      taskIds: ["kb-001", "kv-001"],
      currentTask: catalog.tasks[1],
      current: 2,
      total: 2,
      completed: 1,
      activeDurationMs: 90_000,
    });
  });

  it("ignores other owners, terminal phases, blueprints, and stale tasks", () => {
    const candidates = [
      activeRun(runId, { runOwnerId: otherOwner }),
      activeRun(runId, { phase: "submitting" }),
      activeRun(runId, { blueprintVersion: "ftn-p1:2025.1" }),
      activeRun(runId, { taskRevision: revision("e") }),
    ];

    expect(
      selectPracticeRuntimeResume(candidates, ownerId, catalog),
    ).toBeNull();
    expect(
      selectPracticeRuntimeResume([activeRun(runId)], undefined, catalog),
    ).toBeNull();
  });

  it("keeps a local guest run resumable", () => {
    const guest = activeRun(runId, { runOwnerId: null });

    expect(selectPracticeRuntimeResume([guest], null, catalog)?.runId).toBe(
      runId,
    );
  });

  it("uses run ID as a stable tie breaker", () => {
    const first = activeRun(newerRunId);
    const second = activeRun(runId);

    expect(
      selectPracticeRuntimeResume([first, second], ownerId, catalog)?.runId,
    ).toBe(runId);
  });

  it("builds a runtime-required link to the exact current task", () => {
    const resume = selectPracticeRuntimeResume(
      [activeRun(runId, { currentIndex: 1 })],
      ownerId,
      catalog,
    );
    expect(resume).not.toBeNull();

    expect(practiceRuntimeResumeHref(resume!, "/cabinet")).toBe(
      "/tasks/kvadratne-jednacine/kv-001?returnTo=%2Fcabinet&set=kb-001%2Ckv-001&practice=5ff78318-3436-4b4e-99b8-77ef34366ad3&runtime=1",
    );
  });
});

function activeRun(
  id: string,
  overrides: {
    runOwnerId?: string | null;
    phase?: PersistedPracticeRun["phase"];
    blueprintVersion?: string;
    taskRevision?: string;
    startedAt?: number;
    updatedAt?: number;
    currentIndex?: number;
    activeDurationMs?: number;
  } = {},
): PersistedPracticeRun {
  const runStartedAt = overrides.startedAt ?? startedAt;
  const tasks = catalog.tasks.map((task, index) => ({
    ...task,
    revision:
      index === 0 ? (overrides.taskRevision ?? task.revision) : task.revision,
  }));
  return {
    assignment: {
      runId: id,
      blueprintVersion: overrides.blueprintVersion ?? catalog.blueprintVersion,
      contentRevision: revision("f"),
      tasks,
    },
    runOwnerId:
      overrides.runOwnerId === undefined ? ownerId : overrides.runOwnerId,
    startedAt: runStartedAt,
    startedRemotely: true,
    checkpointVersion: 1,
    checkpointRevision: 1,
    syncedAttemptCounts: [0, 0],
    currentIndex: overrides.currentIndex ?? 0,
    activeDurationMs: overrides.activeDurationMs ?? 0,
    items: tasks.map((task) => ({
      taskId: task.id,
      attempts: [],
      draft: null,
    })),
    checkpointDirty: false,
    checkpointFlight: null,
    phase: overrides.phase ?? "active",
    submission: null,
    updatedAt: overrides.updatedAt ?? runStartedAt,
  };
}

function attempt(outcome: "correct" | "incorrect") {
  return {
    id: crypto.randomUUID(),
    number: 1,
    startedAt,
    submittedAt: startedAt + 1_000,
    activeDurationMs: 1_000,
    answers: ["answer"],
    outcome,
    helpLevel: 0,
  };
}
