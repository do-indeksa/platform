import { createHash } from "node:crypto";
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
const contentRevision = taskSetRevision(catalog.tasks);

describe("practice runtime resume", () => {
  it("selects the newest current owner run despite later sync metadata", async () => {
    const older = activeRun(runId, { updatedAt: startedAt + 10_000 });
    const newer = activeRun(newerRunId, {
      startedAt: startedAt + 1_000,
      updatedAt: startedAt + 2_000,
      currentIndex: 1,
    });
    newer.items[0].attempts.push(attempt("correct"));
    newer.items[1].attempts.push(attempt("incorrect"));

    await expect(
      selectPracticeRuntimeResume([older, newer], ownerId, catalog),
    ).resolves.toEqual({
      runId: newerRunId,
      taskIds: ["kb-001", "kv-001"],
      currentTask: catalog.tasks[1],
      current: 2,
      total: 2,
      completed: 1,
    });
  });

  it("skips a newer invalid aggregate revision for an older valid run", async () => {
    const valid = activeRun(runId);
    const invalid = activeRun(newerRunId, {
      startedAt: startedAt + 1_000,
      contentRevision: revision("f"),
    });

    await expect(
      selectPracticeRuntimeResume([invalid, valid], ownerId, catalog),
    ).resolves.toMatchObject({ runId });
  });

  it("ignores incompatible owners, phases, blueprints, tasks, and items", async () => {
    const candidates = [
      activeRun(runId, { runOwnerId: otherOwner }),
      activeRun(runId, { phase: "submitting" }),
      activeRun(runId, { blueprintVersion: "ftn-p1:2025.1" }),
      activeRun(runId, { taskRevision: revision("e") }),
      activeRun(runId, { firstItemTaskId: "kv-001" }),
    ];

    await expect(
      selectPracticeRuntimeResume(candidates, ownerId, catalog),
    ).resolves.toBeNull();
    await expect(
      selectPracticeRuntimeResume([activeRun(runId)], undefined, catalog),
    ).resolves.toBeNull();
  });

  it("keeps a valid local guest run resumable", async () => {
    const guest = activeRun(runId, { runOwnerId: null });

    await expect(
      selectPracticeRuntimeResume([guest], null, catalog),
    ).resolves.toMatchObject({ runId });
  });

  it("uses run ID as a stable tie breaker", async () => {
    await expect(
      selectPracticeRuntimeResume(
        [activeRun(newerRunId), activeRun(runId)],
        ownerId,
        catalog,
      ),
    ).resolves.toMatchObject({ runId });
  });

  it("builds a runtime-required link to the exact current task", async () => {
    const resume = await selectPracticeRuntimeResume(
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
    contentRevision?: string;
    taskRevision?: string;
    firstItemTaskId?: string;
    startedAt?: number;
    updatedAt?: number;
    currentIndex?: number;
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
      contentRevision: overrides.contentRevision ?? contentRevision,
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
    activeDurationMs: 0,
    items: tasks.map((task, index) => ({
      taskId: index === 0 ? (overrides.firstItemTaskId ?? task.id) : task.id,
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

function taskSetRevision(
  tasks: readonly { id: string; revision: string }[],
): string {
  const hash = createHash("sha256");
  for (const task of tasks) {
    hash.update(task.id);
    hash.update("\0");
    hash.update(task.revision);
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}
