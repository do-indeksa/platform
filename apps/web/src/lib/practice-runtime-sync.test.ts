import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeGraphQLError } from "./practice-cloud-client";
import type {
  PracticeCloudAssignment,
  PracticeCloudRun,
} from "./practice-cloud-types";
import { progressRunItemId } from "./progress-run";
import {
  emptyPracticeRuntimeState,
  parsePersistedPracticeRuntimeState,
} from "./practice-runtime-persistence";
import {
  syncPracticeRuntimeOwner,
  usePracticeRuntime,
  type PersistedPracticeRun,
} from "./practice-runtime-store";
import {
  syncPracticeRuntimeRun,
  type PracticeRuntimeTransport,
} from "./practice-runtime-sync";

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

describe("practice runtime sync", () => {
  beforeEach(() => {
    usePracticeRuntime.setState({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
      authOwnerGeneration: 0,
    });
  });

  it("drains queued retries and submission in causal order", async () => {
    startOwned();
    appendAttempt(1, "incorrect", 60_000);
    appendAttempt(2, "correct", 120_000);
    expect(
      usePracticeRuntime
        .getState()
        .beginSubmission(runId, startedAt + 180_000, 150_000),
    ).toBe(true);
    const calls: string[] = [];
    const transport = createTransport({
      start: vi.fn(async () => {
        calls.push("start");
      }),
      checkpoint: vi.fn(async (_assignment, input) => {
        calls.push(`checkpoint:${input.drafts[0]?.nextAttempt ?? "empty"}`);
        return input.expectedVersion + 1;
      }),
      recordAttempt: vi.fn(async (_assignment, input) => {
        calls.push(`attempt:${input.attemptNumber}`);
      }),
      submit: vi.fn(async () => {
        calls.push("submit");
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "synced" });

    expect(calls).toEqual([
      "start",
      "checkpoint:1",
      "attempt:1",
      "checkpoint:2",
      "attempt:2",
      "submit",
    ]);
    expect(usePracticeRuntime.getState().runs).toEqual([]);
  });

  it("keeps a durable flight offline and resumes it after reload", async () => {
    startOwned();
    appendAttempt(1, "incorrect", 60_000);
    let offline = true;
    const transport = createTransport({
      checkpoint: vi.fn(async (_assignment, input) => {
        if (offline) throw new Error("network unavailable");
        return input.expectedVersion + 1;
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "offline" });
    expect(currentRun()).toMatchObject({
      startedRemotely: true,
      checkpointVersion: 0,
      checkpointFlight: {
        purpose: "attempt",
        appliedVersion: null,
      },
      syncedAttemptCounts: [0, 0],
    });

    reloadRuntime();
    offline = false;
    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "synced" });
    expect(currentRun()).toMatchObject({
      checkpointVersion: 2,
      checkpointDirty: false,
      checkpointFlight: null,
      syncedAttemptCounts: [1, 0],
    });
    expect(currentRun().items[0].draft).toMatchObject({ nextAttempt: 2 });
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(transport.checkpoint).toHaveBeenCalledTimes(3);
    expect(transport.recordAttempt).toHaveBeenCalledTimes(1);
  });

  it("recovers an idempotent start after its response was lost", async () => {
    startOwned();
    appendAttempt(1, "correct", 60_000);
    let startCall = 0;
    const transport = createTransport({
      start: vi.fn(async () => {
        startCall += 1;
        if (startCall === 1) throw new Error("start response lost");
        throw new PracticeGraphQLError("run exists", "CONFLICT");
      }),
      fetch: vi.fn(async () => emptyRemoteRun(currentRun())),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "offline" });
    reloadRuntime();
    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "synced" });

    expect(transport.start).toHaveBeenCalledTimes(2);
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    expect(transport.recordAttempt).toHaveBeenCalledTimes(1);
    expect(currentRun()).toMatchObject({
      startedRemotely: true,
      syncedAttemptCounts: [1, 0],
    });
  });

  it("retries only the attempt after an applied checkpoint survives reload", async () => {
    startOwned();
    appendAttempt(1, "correct", 60_000);
    let offline = true;
    const transport = createTransport({
      recordAttempt: vi.fn(async () => {
        if (offline) throw new Error("attempt response unavailable");
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "offline" });
    expect(currentRun()).toMatchObject({
      checkpointVersion: 1,
      checkpointFlight: {
        purpose: "attempt",
        appliedVersion: 1,
      },
      syncedAttemptCounts: [0, 0],
    });

    reloadRuntime();
    offline = false;
    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "synced" });
    expect(currentRun()).toMatchObject({
      checkpointVersion: 1,
      checkpointFlight: null,
      checkpointDirty: false,
      syncedAttemptCounts: [1, 0],
    });
    expect(transport.checkpoint).toHaveBeenCalledTimes(1);
    expect(transport.recordAttempt).toHaveBeenCalledTimes(2);
  });

  it("recovers an exactly matching checkpoint after its response was lost", async () => {
    startOwned();
    appendAttempt(1, "incorrect", 60_000);
    let checkpointCall = 0;
    let recoveredRemote: PracticeCloudRun | null = null;
    const transport = createTransport({
      checkpoint: vi.fn(async (_assignment, input) => {
        checkpointCall += 1;
        if (checkpointCall === 1) {
          recoveredRemote = remoteFromFlight(currentRun());
          throw new Error("response lost");
        }
        if (checkpointCall === 2) {
          throw new PracticeGraphQLError("version changed", "CONFLICT");
        }
        return input.expectedVersion + 1;
      }),
      fetch: vi.fn(async () => recoveredRemote),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "offline" });
    reloadRuntime();
    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "synced" });

    expect(transport.fetch).toHaveBeenCalledTimes(1);
    expect(transport.recordAttempt).toHaveBeenCalledTimes(1);
    expect(currentRun()).toMatchObject({
      checkpointVersion: 2,
      checkpointFlight: null,
      checkpointDirty: false,
      syncedAttemptCounts: [1, 0],
    });
  });

  it("exposes a conflict without changing an unmatched flight", async () => {
    startOwned();
    appendAttempt(1, "incorrect", 60_000);
    const transport = createTransport({
      checkpoint: vi.fn(async () => {
        throw new PracticeGraphQLError("version changed", "CONFLICT");
      }),
      fetch: vi.fn(async () => {
        const remote = remoteFromFlight(currentRun());
        return { ...remote, currentIndex: 1 };
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "conflict", code: "CONFLICT" });

    expect(currentRun()).toMatchObject({
      checkpointVersion: 0,
      checkpointFlight: {
        purpose: "attempt",
        appliedVersion: null,
      },
      syncedAttemptCounts: [0, 0],
    });
    expect(transport.recordAttempt).not.toHaveBeenCalled();
  });

  it.each(["BAD_USER_INPUT", "INVALID_STATE", "NOT_FOUND", "UNAUTHENTICATED"])(
    "classifies terminal GraphQL code %s without dropping local work",
    async (code) => {
      startOwned();
      appendAttempt(1, "correct", 60_000);
      const transport = createTransport({
        start: vi.fn(async () => {
          throw new PracticeGraphQLError("terminal write failure", code);
        }),
      });

      await expect(
        syncPracticeRuntimeRun(runId, ownerA, { transport }),
      ).resolves.toEqual({ status: "conflict", code });
      expect(currentRun()).toMatchObject({
        startedRemotely: false,
        syncedAttemptCounts: [0, 0],
      });
    },
  );

  it("does not treat an extra remote attempt as a lost checkpoint response", async () => {
    startOwned();
    appendAttempt(1, "incorrect", 60_000);
    const transport = createTransport({
      checkpoint: vi.fn(async () => {
        throw new PracticeGraphQLError("version changed", "CONFLICT");
      }),
      fetch: vi.fn(async () => {
        const remote = remoteFromFlight(currentRun());
        remote.items[0] = {
          ...remote.items[0],
          attempts: currentRun().items[0].attempts.map((attempt) => ({
            ...attempt,
            answers: [...attempt.answers],
          })),
          draft: null,
        };
        return remote;
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "conflict", code: "CONFLICT" });
    expect(currentRun().syncedAttemptCounts).toEqual([0, 0]);
    expect(transport.recordAttempt).not.toHaveBeenCalled();
  });

  it("aborts across an A-B-A owner generation switch", async () => {
    startOwned();
    const transport = createTransport({
      start: vi.fn(async (_assignment, _startedAt, isCurrentOwner) => {
        syncPracticeRuntimeOwner(ownerB);
        syncPracticeRuntimeOwner(ownerA);
        expect(isCurrentOwner()).toBe(false);
      }),
    });

    await expect(
      syncPracticeRuntimeRun(runId, ownerA, { transport }),
    ).resolves.toEqual({ status: "aborted" });
    expect(usePracticeRuntime.getState()).toMatchObject({
      authOwnerId: ownerA,
      runs: [],
    });
  });

  it("serializes concurrent drains for the same run", async () => {
    startOwned();
    let releaseStart: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const transport = createTransport({
      start: vi.fn(async () => gate),
    });

    const first = syncPracticeRuntimeRun(runId, ownerA, { transport });
    const second = syncPracticeRuntimeRun(runId, ownerA, { transport });
    await vi.waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));
    releaseStart?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "synced" },
      { status: "synced" },
    ]);
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(currentRun().startedRemotely).toBe(true);
  });
});

function createTransport(
  overrides: Partial<PracticeRuntimeTransport> = {},
): PracticeRuntimeTransport {
  return {
    start: vi.fn(async () => {}),
    checkpoint: vi.fn(async (_assignment, input) => input.expectedVersion + 1),
    recordAttempt: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    fetch: vi.fn(async () => null),
    ...overrides,
  };
}

function startOwned(): void {
  syncPracticeRuntimeOwner(ownerA);
  expect(usePracticeRuntime.getState().start({ assignment, startedAt })).toBe(
    true,
  );
}

function appendAttempt(
  number: number,
  outcome: "correct" | "incorrect",
  submittedOffset: number,
): string | null {
  const previousSubmittedAt = currentRun()
    .items.flatMap((item) => item.attempts)
    .reduce(
      (latest, attempt) => Math.max(latest, attempt.submittedAt),
      startedAt,
    );
  return usePracticeRuntime.getState().appendAttempt(runId, {
    taskId: "kb-001",
    startedAt: previousSubmittedAt,
    submittedAt: startedAt + submittedOffset,
    activeDurationMs: startedAt + submittedOffset - previousSubmittedAt,
    answers: [String(number), ""],
    outcome,
    helpLevel: number - 1,
    currentIndex: 0,
    runActiveDurationMs: submittedOffset,
  });
}

function currentRun(): PersistedPracticeRun {
  const run = usePracticeRuntime.getState().runs[0];
  if (run === undefined) throw new Error("practice run is missing");
  return run;
}

function reloadRuntime(): void {
  const runtime = parsePersistedPracticeRuntimeState(
    structuredClone({ runs: usePracticeRuntime.getState().runs }),
  );
  usePracticeRuntime.setState({ ...runtime, authOwnerId: ownerA });
}

function remoteFromFlight(run: PersistedPracticeRun): PracticeCloudRun {
  const flight = run.checkpointFlight;
  if (flight === null) throw new Error("checkpoint flight is missing");
  return {
    runId: run.assignment.runId,
    runOwnerId: ownerA,
    blueprintVersion: run.assignment.blueprintVersion,
    contentRevision: run.assignment.contentRevision,
    startedAt: run.startedAt,
    checkpointVersion: flight.expectedVersion + 1,
    currentIndex: flight.currentIndex,
    activeDurationMs: flight.activeDurationMs,
    checkpointUpdatedAt: new Date(
      run.startedAt + flight.activeDurationMs,
    ).toISOString(),
    items: run.items.map((item, index) => {
      const task = run.assignment.tasks[index];
      const draft = flight.drafts.find(
        (candidate) => candidate.taskId === item.taskId,
      );
      return {
        runItemId: progressRunItemId(run.assignment.runId, item.taskId),
        task: { ...task },
        attempts: item.attempts
          .slice(0, run.syncedAttemptCounts[index])
          .map((attempt) => ({ ...attempt, answers: [...attempt.answers] })),
        draft:
          draft === undefined
            ? null
            : {
                nextAttempt: draft.nextAttempt,
                answers: [...draft.answers],
                helpLevel: draft.helpLevel,
                stale: false,
              },
      };
    }),
  };
}

function emptyRemoteRun(run: PersistedPracticeRun): PracticeCloudRun {
  return {
    runId: run.assignment.runId,
    runOwnerId: ownerA,
    blueprintVersion: run.assignment.blueprintVersion,
    contentRevision: run.assignment.contentRevision,
    startedAt: run.startedAt,
    checkpointVersion: 0,
    currentIndex: 0,
    activeDurationMs: null,
    checkpointUpdatedAt: null,
    items: run.assignment.tasks.map((task) => ({
      runItemId: progressRunItemId(run.assignment.runId, task.id),
      task: { ...task },
      attempts: [],
      draft: null,
    })),
  };
}
