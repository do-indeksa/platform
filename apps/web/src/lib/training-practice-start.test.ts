import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeCloudAssignment } from "./practice-cloud-types";
import { emptyPracticeRuntimeState } from "./practice-runtime-persistence";
import {
  syncPracticeRuntimeOwner,
  usePracticeRuntime,
} from "./practice-runtime-store";
import type { TrainingPracticeTask } from "./training-practice-assignment";
import { beginTrainingPracticeRun } from "./training-practice-start";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerA = "39ec4650-762d-437f-9917-c31ab167cb99";
const ownerB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const task: TrainingPracticeTask = {
  id: "kb-001",
  revision: `sha256:${"a".repeat(64)}`,
  slot: 1,
  topic: "kompleksni-brojevi",
  difficulty: 2,
  answerPartCount: 2,
};

describe("begin training practice", () => {
  beforeEach(() => {
    usePracticeRuntime.setState({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
      authOwnerGeneration: 0,
    });
  });

  it("commits a guest assignment before reporting success", async () => {
    syncPracticeRuntimeOwner(null);

    await expect(begin(null)).resolves.toBe(true);
    expect(usePracticeRuntime.getState().runs[0]).toMatchObject({
      assignment: {
        runId,
        blueprintVersion: "ftn-p1:2026.1",
        tasks: [{ id: "kb-001", answerPartCount: 2 }],
      },
      runOwnerId: null,
      startedAt,
    });
  });

  it("does not commit when auth ownership is unresolved", async () => {
    await expect(begin(null)).resolves.toBe(false);
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });

  it("rejects an owner generation changed during assignment hashing", async () => {
    syncPracticeRuntimeOwner(ownerA);
    let release: ((assignment: PracticeCloudAssignment) => void) | undefined;
    const assignment = new Promise<PracticeCloudAssignment>((resolve) => {
      release = resolve;
    });
    const pending = beginTrainingPracticeRun(input(ownerA), {
      createAssignment: vi.fn(async () => assignment),
    });

    syncPracticeRuntimeOwner(ownerB);
    syncPracticeRuntimeOwner(ownerA);
    release?.({
      runId,
      blueprintVersion: "ftn-p1:2026.1",
      contentRevision: `sha256:${"b".repeat(64)}`,
      tasks: [task],
    });

    await expect(pending).resolves.toBe(false);
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });

  it("fails without replacing an existing run", async () => {
    syncPracticeRuntimeOwner(ownerA);
    await expect(begin(ownerA)).resolves.toBe(true);
    await expect(begin(ownerA)).resolves.toBe(false);
    expect(usePracticeRuntime.getState().runs).toHaveLength(1);
  });
});

function begin(ownerId: string | null): Promise<boolean> {
  return beginTrainingPracticeRun(input(ownerId));
}

function input(ownerId: string | null) {
  return {
    ownerId,
    runId,
    startedAt,
    blueprintVersion: "2026.1",
    selectedTaskIds: ["kb-001"],
    catalog: [task],
  };
}
