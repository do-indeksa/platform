import { beforeEach, describe, expect, it } from "vitest";
import type { PracticeCloudAssignment } from "./practice-cloud-types";
import { emptyPracticeRuntimeState } from "./practice-runtime-persistence";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import {
  syncPracticeRuntimeOwner,
  usePracticeRuntime,
} from "./practice-runtime-store";
import {
  appendPracticeWorkspaceAttempt,
  changePracticeWorkspaceDraft,
  readPracticeWorkspace,
  visitPracticeWorkspace,
  type PracticeWorkspaceContext,
} from "./practice-workspace-runtime";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerA = "39ec4650-762d-437f-9917-c31ab167cb99";
const ownerB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const tasks = [
  {
    id: "kb-001",
    revision: revision("a"),
    slot: 1,
    topic: "kompleksni-brojevi",
    answerPartCount: 2,
  },
  {
    id: "log-001",
    revision: revision("b"),
    slot: 3,
    topic: "logaritmi",
    answerPartCount: 1,
  },
] as const;
const assignment: PracticeCloudAssignment = {
  runId,
  blueprintVersion: "ftn-p1:2026.1",
  contentRevision: revision("c"),
  tasks,
};

describe("practice workspace runtime", () => {
  beforeEach(() => {
    usePracticeRuntime.setState({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
      authOwnerGeneration: 0,
    });
    syncPracticeRuntimeOwner(ownerA);
    expect(
      usePracticeRuntime.getState().start({ assignment, startedAt }),
    ).toBe(true);
  });

  it("reads and updates only the exact persisted assignment", () => {
    expect(readPracticeWorkspace(context())).toMatchObject({
      startedAt,
      currentIndex: 0,
      activeDurationMs: 0,
      attempts: [],
      draft: null,
    });
    expect(visitPracticeWorkspace(context(1), 20_000)).toBe(true);
    expect(
      changePracticeWorkspaceDraft(context(1), {
        answers: ["2"],
        helpLevel: 1,
        activeDurationMs: 25_000,
      }),
    ).toBe(true);
    expect(readPracticeWorkspace(context(1))).toMatchObject({
      currentIndex: 1,
      activeDurationMs: 25_000,
      draft: { nextAttempt: 1, answers: ["2"], helpLevel: 1 },
    });
  });

  it("appends a deterministic attempt through the bound task", () => {
    const attemptId = appendPracticeWorkspaceAttempt(context(), {
      startedAt,
      submittedAt: startedAt + 10_000,
      activeDurationMs: 10_000,
      answers: ["1", "2"],
      outcome: "incorrect",
      helpLevel: 0,
      runActiveDurationMs: 10_000,
    });

    expect(attemptId).toBe(
      progressPracticeAttemptId(progressRunItemId(runId, "kb-001"), 1),
    );
    expect(readPracticeWorkspace(context())?.attempts).toMatchObject([
      { id: attemptId, number: 1, outcome: "incorrect" },
    ]);
  });

  it.each([
    ["owner", () => ({ ...context(), ownerId: ownerB })],
    [
      "order",
      () => ({ ...context(), sequence: [...tasks].reverse(), task: tasks[1] }),
    ],
    [
      "revision",
      () => ({
        ...context(),
        task: { ...tasks[0], revision: revision("f") },
        sequence: [{ ...tasks[0], revision: revision("f") }, tasks[1]],
      }),
    ],
    ["index", () => ({ ...context(), currentIndex: 1 })],
  ])("fails closed for a mismatched %s", (_name, mismatch) => {
    const invalid = mismatch() as PracticeWorkspaceContext;
    expect(readPracticeWorkspace(invalid)).toBeNull();
    expect(
      changePracticeWorkspaceDraft(invalid, {
        answers: invalid.task.id === "kb-001" ? ["", ""] : [""],
        helpLevel: 0,
        activeDurationMs: 10_000,
      }),
    ).toBe(false);
    expect(usePracticeRuntime.getState().runs[0]).toMatchObject({
      currentIndex: 0,
      activeDurationMs: 0,
      checkpointRevision: 0,
      checkpointDirty: false,
    });
  });

  it("rechecks ownership before every mutation", () => {
    const owned = context();
    expect(readPracticeWorkspace(owned)).not.toBeNull();
    syncPracticeRuntimeOwner(ownerB);

    expect(visitPracticeWorkspace(owned, 10_000)).toBe(false);
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });
});

function context(currentIndex = 0): PracticeWorkspaceContext {
  return {
    runId,
    ownerId: ownerA,
    currentIndex,
    task: tasks[currentIndex],
    sequence: tasks,
  };
}
