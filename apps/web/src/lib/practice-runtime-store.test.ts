import { beforeEach, describe, expect, it } from "vitest";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import type {
  PracticeCloudAssignment,
  PracticeCloudRun,
} from "./practice-cloud-types";
import {
  emptyPracticeRuntimeState,
  migratePracticeRuntimeState,
  parsePersistedPracticeRuntimeState,
} from "./practice-runtime-persistence";
import {
  currentPracticeDrafts,
  nextPendingAttempt,
  reconcilePracticeRuntimeOwner,
  syncPracticeRuntimeOwner,
  usePracticeRuntime,
  type PersistedPracticeRun,
  type PracticeCheckpointFlight,
} from "./practice-runtime-store";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerA = "39ec4650-762d-437f-9917-c31ab167cb99";
const ownerB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const assignment: PracticeCloudAssignment = {
  runId,
  blueprintVersion: "ftn-p1:2026.1",
  contentRevision:
    "sha256:86c961a236f6c615a8db24b074be906e217b222635badba9fb02dbe641c8012a",
  tasks: [
    {
      id: "kb-001",
      revision: revision("a"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 2,
    },
    {
      id: "kb-002",
      revision: revision("b"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 1,
    },
  ],
};

describe("practice runtime persistence", () => {
  beforeEach(() => {
    usePracticeRuntime.setState({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
    });
  });

  it("persists an immutable multi-task assignment without task content", () => {
    syncPracticeRuntimeOwner(null);
    expect(usePracticeRuntime.getState().start({ assignment, startedAt })).toBe(
      true,
    );

    const run = currentRun();
    expect(run).toMatchObject({
      assignment,
      runOwnerId: null,
      startedRemotely: false,
      checkpointVersion: 0,
      checkpointRevision: 0,
      syncedAttemptCounts: [0, 0],
      currentIndex: 0,
      activeDurationMs: 0,
      items: [
        { taskId: "kb-001", attempts: [], draft: null },
        { taskId: "kb-002", attempts: [], draft: null },
      ],
      checkpointDirty: false,
      phase: "active",
    });
    expect(JSON.stringify(run)).not.toMatch(
      /statement|solution|expectedAnswer|gradingRule/i,
    );
  });

  it("appends deterministic retries and keeps globally causal order", () => {
    startOwned();
    const first = appendAttempt("kb-001", 1, "incorrect", 0, 60_000);
    const second = appendAttempt("kb-002", 1, "incorrect", 0, 120_000);
    const third = appendAttempt("kb-001", 2, "correct", 1, 180_000);

    expect([first, second, third]).toEqual([
      progressPracticeAttemptId(progressRunItemId(runId, "kb-001"), 1),
      progressPracticeAttemptId(progressRunItemId(runId, "kb-002"), 1),
      progressPracticeAttemptId(progressRunItemId(runId, "kb-001"), 2),
    ]);
    expect(nextPendingAttempt(currentRun())?.attempt.id).toBe(first);
    expect(currentRun()).toMatchObject({
      checkpointRevision: 3,
      items: [
        {
          attempts: [
            { number: 1, outcome: "incorrect", helpLevel: 0 },
            { number: 2, outcome: "correct", helpLevel: 1 },
          ],
          draft: null,
        },
        {
          attempts: [{ number: 1, outcome: "incorrect" }],
          draft: { nextAttempt: 2 },
        },
      ],
    });
    expect(appendAttempt("kb-001", 3, "incorrect", 1, 240_000)).toBeNull();
  });

  it("persists the final bounded retry without creating attempt twenty-one", () => {
    startOwned();
    let lastId: string | null = null;
    for (let number = 1; number <= 20; number += 1) {
      lastId = appendAttempt("kb-001", number, "incorrect", 0, number * 60_000);
      expect(lastId).not.toBeNull();
    }

    expect(currentRun().items[0].attempts).toHaveLength(20);
    expect(currentRun().items[0].attempts.at(-1)).toMatchObject({
      id: lastId,
      number: 20,
    });
    expect(currentRun().items[0].draft).toBeNull();
    expect(appendAttempt("kb-001", 21, "incorrect", 0, 21 * 60_000)).toBeNull();
  });

  it("keeps exact in-flight state while newer retries arrive", () => {
    startOwned();
    expect(usePracticeRuntime.getState().markStartedRemotely(runId)).toBe(true);
    const firstId = appendAttempt("kb-001", 1, "incorrect", 0, 60_000);
    const firstFlight = attemptFlight(currentRun(), firstId as string);

    expect(
      usePracticeRuntime.getState().beginCheckpointFlight(runId, firstFlight),
    ).toBe(true);
    const secondId = appendAttempt("kb-001", 2, "incorrect", 1, 120_000);
    expect(secondId).not.toBeNull();

    const reloaded = parsePersistedPracticeRuntimeState({
      runs: [currentRun()],
    });
    expect(reloaded.runs[0]).toMatchObject({
      checkpointRevision: 2,
      checkpointFlight: {
        attemptId: firstId,
        checkpointRevision: 1,
        appliedVersion: null,
      },
    });
    expect(
      usePracticeRuntime
        .getState()
        .markCheckpointApplied(runId, firstFlight.id, 1),
    ).toBe(true);
    expect(
      usePracticeRuntime.getState().markAttemptSynced(runId, firstId as string),
    ).toBe(true);
    expect(currentRun()).toMatchObject({
      checkpointVersion: 1,
      syncedAttemptCounts: [1, 0],
      checkpointDirty: true,
      checkpointFlight: null,
    });
    expect(nextPendingAttempt(currentRun())?.attempt.id).toBe(secondId);
  });

  it("does not erase edits made while a draft checkpoint is in flight", () => {
    startOwned();
    expect(usePracticeRuntime.getState().markStartedRemotely(runId)).toBe(true);
    expect(
      usePracticeRuntime.getState().changeDraft(runId, {
        taskId: "kb-001",
        answers: ["one", ""],
        helpLevel: 0,
        currentIndex: 0,
        activeDurationMs: 30_000,
      }),
    ).toBe(true);
    const flight = draftFlight(currentRun());
    expect(
      usePracticeRuntime.getState().beginCheckpointFlight(runId, flight),
    ).toBe(true);
    expect(
      usePracticeRuntime.getState().changeDraft(runId, {
        taskId: "kb-001",
        answers: ["newer", ""],
        helpLevel: 0,
        currentIndex: 0,
        activeDurationMs: 40_000,
      }),
    ).toBe(true);
    expect(
      usePracticeRuntime.getState().markCheckpointApplied(runId, flight.id, 1),
    ).toBe(true);
    expect(
      usePracticeRuntime.getState().finishCheckpointFlight(runId, flight.id),
    ).toBe(true);
    expect(currentRun()).toMatchObject({
      checkpointVersion: 1,
      checkpointDirty: true,
    });
    expect(currentRun().items[0].draft?.answers).toEqual(["newer", ""]);
  });

  it("queues submission offline and removes the run only after success", () => {
    startOwned();
    appendAttempt("kb-001", 1, "correct", 0, 60_000);

    expect(
      usePracticeRuntime
        .getState()
        .beginSubmission(runId, startedAt + 120_000, 90_000),
    ).toBe(true);
    expect(currentRun()).toMatchObject({
      phase: "submitting",
      submission: {
        submittedAt: startedAt + 120_000,
        activeDurationMs: 90_000,
      },
    });
    expect(
      usePracticeRuntime.getState().changeDraft(runId, {
        taskId: "kb-002",
        answers: ["late"],
        helpLevel: 0,
        currentIndex: 1,
        activeDurationMs: 100_000,
      }),
    ).toBe(false);
    expect(usePracticeRuntime.getState().finishSubmission(runId)).toBe(true);
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });

  it("does not finish an active run through the submission success path", () => {
    startOwned();

    expect(usePracticeRuntime.getState().finishSubmission(runId)).toBe(false);
    expect(currentRun().phase).toBe("active");
  });

  it("keeps the retry draft dirty after an incorrect attempt is synced", () => {
    startOwned();
    expect(usePracticeRuntime.getState().markStartedRemotely(runId)).toBe(true);
    const attemptId = appendAttempt("kb-001", 1, "incorrect", 0, 60_000);
    const flight = attemptFlight(currentRun(), attemptId as string);

    expect(
      usePracticeRuntime.getState().beginCheckpointFlight(runId, flight),
    ).toBe(true);
    expect(
      usePracticeRuntime.getState().markCheckpointApplied(runId, flight.id, 1),
    ).toBe(true);
    expect(
      usePracticeRuntime
        .getState()
        .markAttemptSynced(runId, attemptId as string),
    ).toBe(true);

    expect(currentRun()).toMatchObject({
      checkpointDirty: true,
      checkpointFlight: null,
    });
    expect(currentRun().items[0].draft).toMatchObject({ nextAttempt: 2 });
  });

  it("claims guest work and clears every run on owner changes", () => {
    syncPracticeRuntimeOwner(null);
    usePracticeRuntime.getState().start({ assignment, startedAt });
    usePracticeRuntime.getState().start({
      assignment: { ...assignment, runId: crypto.randomUUID() },
      startedAt: startedAt + 1,
    });

    const claimed = reconcilePracticeRuntimeOwner(
      { runs: usePracticeRuntime.getState().runs },
      ownerA,
    );
    expect(claimed.runtime.runs).toHaveLength(2);
    expect(claimed.runtime.runs.every((run) => run.runOwnerId === ownerA)).toBe(
      true,
    );
    expect(
      reconcilePracticeRuntimeOwner(claimed.runtime, ownerB).runtime,
    ).toEqual(emptyPracticeRuntimeState());
    expect(
      reconcilePracticeRuntimeOwner(claimed.runtime, null).runtime,
    ).toEqual(emptyPracticeRuntimeState());
  });

  it("restores an owner-compatible cloud run and strips stale drafts", () => {
    syncPracticeRuntimeOwner(ownerA);
    const itemId = progressRunItemId(runId, "kb-001");
    const remote: PracticeCloudRun = {
      runId,
      runOwnerId: ownerA,
      blueprintVersion: assignment.blueprintVersion,
      contentRevision: assignment.contentRevision,
      startedAt,
      checkpointVersion: 2,
      currentIndex: 1,
      activeDurationMs: 60_000,
      checkpointUpdatedAt: "2026-08-12T10:01:30.000Z",
      items: [
        {
          runItemId: itemId,
          task: assignment.tasks[0],
          attempts: [
            {
              id: progressPracticeAttemptId(itemId, 1),
              number: 1,
              startedAt,
              submittedAt: startedAt + 60_000,
              activeDurationMs: 60_000,
              answers: ["1", "2"],
              outcome: "correct",
              helpLevel: 0,
            },
          ],
          draft: {
            nextAttempt: 1,
            answers: ["1", "2"],
            helpLevel: 0,
            stale: true,
          },
        },
        {
          runItemId: progressRunItemId(runId, "kb-002"),
          task: assignment.tasks[1],
          attempts: [],
          draft: {
            nextAttempt: 1,
            answers: ["draft"],
            helpLevel: 0,
            stale: false,
          },
        },
      ],
    };

    expect(usePracticeRuntime.getState().restore(remote)).toBe(true);
    expect(currentRun()).toMatchObject({
      startedRemotely: true,
      checkpointVersion: 2,
      syncedAttemptCounts: [1, 0],
      checkpointDirty: false,
      items: [
        { draft: null },
        { draft: { nextAttempt: 1, answers: ["draft"] } },
      ],
    });
    expect(
      usePracticeRuntime.getState().restore({ ...remote, runOwnerId: ownerB }),
    ).toBe(false);
  });

  it.each([
    [
      "duplicate run IDs",
      (run: PersistedPracticeRun) => ({ runs: [run, run] }),
    ],
    [
      "mixed owners",
      (run: PersistedPracticeRun) => ({
        runs: [
          run,
          {
            ...run,
            assignment: { ...run.assignment, runId: crypto.randomUUID() },
            runOwnerId: ownerB,
          },
        ],
      }),
    ],
    [
      "mixed guest and user owners",
      (run: PersistedPracticeRun) => ({
        runs: [
          { ...run, runOwnerId: null },
          {
            ...run,
            assignment: {
              ...run.assignment,
              runId: crypto.randomUUID(),
            },
            runOwnerId: ownerA,
          },
        ],
      }),
    ],
    [
      "negative checkpoint",
      (run: PersistedPracticeRun) => ({
        runs: [{ ...run, checkpointVersion: -1 }],
      }),
    ],
    [
      "wrong synced frontier",
      (run: PersistedPracticeRun) => ({
        runs: [{ ...run, syncedAttemptCounts: [2, 0] }],
      }),
    ],
    [
      "foreign remote guest",
      (run: PersistedPracticeRun) => ({
        runs: [{ ...run, startedRemotely: true, runOwnerId: null }],
      }),
    ],
  ])("fails closed for %s", (_name, mutate) => {
    startOwned();
    const malformed = mutate(currentRun());
    expect(parsePersistedPracticeRuntimeState(malformed)).toEqual(
      emptyPracticeRuntimeState(),
    );
  });

  it("drops unknown legacy state versions", () => {
    startOwned();
    expect(migratePracticeRuntimeState({ runs: [currentRun()] }, 0)).toEqual(
      emptyPracticeRuntimeState(),
    );
  });
});

function startOwned(): void {
  syncPracticeRuntimeOwner(ownerA);
  expect(usePracticeRuntime.getState().start({ assignment, startedAt })).toBe(
    true,
  );
}

function currentRun(): PersistedPracticeRun {
  const run = usePracticeRuntime.getState().runs[0];
  if (!run) throw new Error("practice run is missing");
  return run;
}

function appendAttempt(
  taskId: string,
  attemptNumber: number,
  outcome: "correct" | "incorrect" | "skipped",
  helpLevel: number,
  submittedOffset: number,
): string | null {
  const answers =
    taskId === "kb-001" ? [String(attemptNumber), ""] : [String(attemptNumber)];
  return usePracticeRuntime.getState().appendAttempt(runId, {
    taskId,
    startedAt: latestSubmittedAt(),
    submittedAt: startedAt + submittedOffset,
    activeDurationMs: startedAt + submittedOffset - latestSubmittedAt(),
    answers,
    outcome,
    helpLevel,
    currentIndex: taskId === "kb-001" ? 0 : 1,
    runActiveDurationMs: submittedOffset,
  });
}

function latestSubmittedAt(): number {
  return currentRun()
    .items.flatMap((item) => item.attempts)
    .reduce(
      (latest, attempt) => Math.max(latest, attempt.submittedAt),
      startedAt,
    );
}

function attemptFlight(
  run: PersistedPracticeRun,
  attemptId: string,
): PracticeCheckpointFlight {
  const pending = nextPendingAttempt(run);
  if (!pending || pending.attempt.id !== attemptId)
    throw new Error("pending attempt is missing");
  return {
    id: `checkpoint:attempt:${attemptId}`,
    purpose: "attempt",
    attemptId,
    expectedVersion: run.checkpointVersion,
    appliedVersion: null,
    checkpointRevision: run.checkpointRevision,
    currentIndex: run.currentIndex,
    activeDurationMs: run.activeDurationMs,
    drafts: [
      {
        taskId: pending.taskId,
        nextAttempt: pending.attempt.number,
        answers: [...pending.attempt.answers],
        helpLevel: pending.attempt.helpLevel,
      },
    ],
  };
}

function draftFlight(run: PersistedPracticeRun): PracticeCheckpointFlight {
  return {
    id: `checkpoint:draft:${run.checkpointRevision}`,
    purpose: "draft",
    attemptId: null,
    expectedVersion: run.checkpointVersion,
    appliedVersion: null,
    checkpointRevision: run.checkpointRevision,
    currentIndex: run.currentIndex,
    activeDurationMs: run.activeDurationMs,
    drafts: currentPracticeDrafts(run),
  };
}
