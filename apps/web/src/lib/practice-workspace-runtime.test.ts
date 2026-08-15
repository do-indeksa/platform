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
  finishPracticeWorkspace,
  inspectPracticeWorkspace,
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
    expect(usePracticeRuntime.getState().start({ assignment, startedAt })).toBe(
      true,
    );
  });

  it("reads and updates only the exact persisted assignment", () => {
    expect(readPracticeWorkspace(context())).toMatchObject({
      startedAt,
      currentIndex: 0,
      activeDurationMs: 0,
      taskStatuses: { "kb-001": "pending", "log-001": "pending" },
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
    expect(readPracticeWorkspace(context())?.latestSubmittedAt).toBe(
      startedAt + 10_000,
    );
    expect(readPracticeWorkspace(context())?.taskStatuses).toEqual({
      "kb-001": "retry",
      "log-001": "pending",
    });
  });

  it("submits an owned run with attempts", () => {
    expect(
      appendPracticeWorkspaceAttempt(context(), {
        startedAt,
        submittedAt: startedAt + 10_000,
        activeDurationMs: 10_000,
        answers: ["1", "2"],
        outcome: "correct",
        helpLevel: 0,
        runActiveDurationMs: 10_000,
      }),
    ).not.toBeNull();

    expect(
      finishPracticeWorkspace(context(), {
        submittedAt: startedAt + 12_000,
        activeDurationMs: 12_000,
      }),
    ).toBe("submitting");
    expect(usePracticeRuntime.getState().runs[0]).toMatchObject({
      phase: "submitting",
      submission: {
        submittedAt: startedAt + 12_000,
        activeDurationMs: 12_000,
      },
    });
  });

  it("abandons an owned run without attempts", () => {
    expect(
      finishPracticeWorkspace(context(), {
        submittedAt: startedAt + 12_000,
        activeDurationMs: 12_000,
      }),
    ).toBe("abandoning");
    expect(usePracticeRuntime.getState().runs[0]).toMatchObject({
      phase: "abandoning",
      submission: null,
    });
  });

  it("removes a guest run locally", () => {
    syncPracticeRuntimeOwner(null);
    const guestRunId = crypto.randomUUID();
    expect(
      usePracticeRuntime.getState().start({
        assignment: { ...assignment, runId: guestRunId },
        startedAt,
      }),
    ).toBe(true);
    const guestContext = {
      ...context(),
      runId: guestRunId,
      ownerId: null,
    };

    expect(
      finishPracticeWorkspace(guestContext, {
        submittedAt: startedAt + 12_000,
        activeDurationMs: 12_000,
      }),
    ).toBe("removed");
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });

  it("distinguishes an absent run from an invalid binding", () => {
    expect(
      inspectPracticeWorkspace({
        ...context(),
        runId: "7e50bc03-c5a8-458b-b90b-5c1e411b5a0e",
      }),
    ).toEqual({ status: "missing" });
    expect(
      inspectPracticeWorkspace({
        ...context(),
        sequence: [{ ...tasks[0], slot: 2 }, tasks[1]],
        task: { ...tasks[0], slot: 2 },
      }),
    ).toEqual({ status: "mismatch" });
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
    [
      "slot",
      () => ({
        ...context(),
        task: { ...tasks[0], slot: 2 },
        sequence: [{ ...tasks[0], slot: 2 }, tasks[1]],
      }),
    ],
    [
      "topic",
      () => ({
        ...context(),
        task: { ...tasks[0], topic: "logaritmi" },
        sequence: [{ ...tasks[0], topic: "logaritmi" }, tasks[1]],
      }),
    ],
    [
      "answer shape",
      () => ({
        ...context(),
        task: { ...tasks[0], answerPartCount: 1 },
        sequence: [{ ...tasks[0], answerPartCount: 1 }, tasks[1]],
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
    expect(
      finishPracticeWorkspace(invalid, {
        submittedAt: startedAt + 10_000,
        activeDurationMs: 10_000,
      }),
    ).toBeNull();
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
