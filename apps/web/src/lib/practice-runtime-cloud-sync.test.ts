import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeCloudRun } from "./practice-cloud-types";
import {
  bootstrapPracticeRuntimeCloud,
  retryPracticeRuntimeCloud,
  usePracticeRuntimeCloud,
} from "./practice-runtime-cloud-sync";
import { emptyPracticeRuntimeState } from "./practice-runtime-persistence";
import {
  syncPracticeRuntimeOwner,
  usePracticeRuntime,
} from "./practice-runtime-store";

const mocks = vi.hoisted(() => ({
  fetchLatest: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("./practice-cloud-client", () => ({
  fetchLatestPracticeCloudRun: mocks.fetchLatest,
}));

vi.mock("./practice-runtime-sync", () => ({
  syncPracticeRuntimeRuns: mocks.sync,
}));

const ownerA = "39ec4650-762d-437f-9917-c31ab167cb99";
const ownerB = "4f7d3dde-1a41-4d93-83c2-7b7e97367e86";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const task = {
  id: "kb-001",
  revision: revision("a"),
  slot: 1,
  topic: "kompleksni-brojevi",
  answerPartCount: 1,
};
const catalog = {
  blueprintVersion: "ftn-p1:2026.1",
  tasks: [task],
};

describe("practice runtime cloud coordinator", () => {
  beforeEach(() => {
    usePracticeRuntime.setState({
      ...emptyPracticeRuntimeState(),
      authOwnerId: undefined,
      authOwnerGeneration: 0,
    });
    usePracticeRuntimeCloud.setState({
      ownerId: undefined,
      enabled: false,
      status: "idle",
    });
    mocks.sync.mockResolvedValue({ entries: [], status: "synced" });
    mocks.fetchLatest.mockResolvedValue(null);
  });

  afterEach(async () => {
    syncPracticeRuntimeOwner(null);
    await bootstrapPracticeRuntimeCloud(null, catalog);
    mocks.fetchLatest.mockReset();
    mocks.sync.mockReset();
  });

  it("drains known work before restoring a fresh-browser cloud run", async () => {
    const events: string[] = [];
    syncPracticeRuntimeOwner(ownerA);
    mocks.sync.mockImplementationOnce(async () => {
      events.push("sync");
      return { entries: [], status: "synced" };
    });
    mocks.fetchLatest.mockImplementationOnce(async () => {
      events.push("fetch");
      return cloudRun(ownerA);
    });

    await bootstrapPracticeRuntimeCloud(ownerA, catalog);

    expect(events).toEqual(["sync", "fetch"]);
    expect(usePracticeRuntimeCloud.getState()).toMatchObject({
      ownerId: ownerA,
      enabled: true,
      status: "ready",
    });
    expect(usePracticeRuntime.getState().runs[0]).toMatchObject({
      assignment: { runId },
      runOwnerId: ownerA,
      startedRemotely: true,
    });
  });

  it.each(["offline", "conflict"] as const)(
    "preserves local work and skips discovery after a %s drain",
    async (status) => {
      startLocal(ownerA);
      const before = structuredClone(usePracticeRuntime.getState().runs);
      mocks.sync.mockResolvedValueOnce({
        entries: [{ runId, result: { status } }],
        status,
      });

      await bootstrapPracticeRuntimeCloud(ownerA, catalog);

      expect(mocks.fetchLatest).not.toHaveBeenCalled();
      expect(usePracticeRuntime.getState().runs).toEqual(before);
      expect(usePracticeRuntimeCloud.getState().status).toBe(status);
    },
  );

  it("ignores a stale response after an A-B-A owner transition", async () => {
    syncPracticeRuntimeOwner(ownerA);
    let release: ((run: PracticeCloudRun) => void) | undefined;
    mocks.fetchLatest.mockImplementationOnce(
      () =>
        new Promise<PracticeCloudRun>((resolve) => {
          release = resolve;
        }),
    );
    const stale = bootstrapPracticeRuntimeCloud(ownerA, catalog);
    await vi.waitFor(() => expect(mocks.fetchLatest).toHaveBeenCalledOnce());

    syncPracticeRuntimeOwner(ownerB);
    await bootstrapPracticeRuntimeCloud(ownerB, catalog);
    syncPracticeRuntimeOwner(ownerA);
    await bootstrapPracticeRuntimeCloud(ownerA, catalog);
    release?.(cloudRun(ownerA));
    await stale;

    expect(usePracticeRuntime.getState()).toMatchObject({
      authOwnerId: ownerA,
      runs: [],
    });
  });

  it("coalesces retries and recovers after connectivity returns", async () => {
    syncPracticeRuntimeOwner(ownerA);
    mocks.fetchLatest.mockRejectedValueOnce(new Error("offline"));
    await bootstrapPracticeRuntimeCloud(ownerA, catalog);
    expect(usePracticeRuntimeCloud.getState().status).toBe("offline");

    let release: (() => void) | undefined;
    mocks.fetchLatest.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const first = retryPracticeRuntimeCloud();
    const second = retryPracticeRuntimeCloud();
    await vi.waitFor(() => expect(mocks.fetchLatest).toHaveBeenCalledTimes(2));
    release?.();
    await Promise.all([first, second]);

    expect(usePracticeRuntimeCloud.getState().status).toBe("ready");
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("retries a transient offline state on a later bootstrap", async () => {
    syncPracticeRuntimeOwner(ownerA);
    mocks.fetchLatest.mockRejectedValueOnce(new Error("offline"));
    await bootstrapPracticeRuntimeCloud(ownerA, catalog);

    await bootstrapPracticeRuntimeCloud(ownerA, catalog);

    expect(usePracticeRuntimeCloud.getState().status).toBe("ready");
    expect(mocks.fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("never replaces a local mutation made during discovery", async () => {
    startLocal(ownerA);
    let release: ((run: PracticeCloudRun) => void) | undefined;
    mocks.fetchLatest
      .mockImplementationOnce(
        () =>
          new Promise<PracticeCloudRun>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(null);
    const bootstrap = bootstrapPracticeRuntimeCloud(ownerA, catalog);
    await vi.waitFor(() => expect(mocks.fetchLatest).toHaveBeenCalledOnce());

    expect(
      usePracticeRuntime.getState().changeDraft(runId, {
        taskId: task.id,
        answers: ["local draft"],
        helpLevel: 0,
        currentIndex: 0,
        activeDurationMs: 1,
      }),
    ).toBe(true);
    release?.(cloudRun(ownerA));
    await bootstrap;

    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.fetchLatest).toHaveBeenCalledTimes(2);
    expect(
      usePracticeRuntime.getState().runs[0].items[0].draft?.answers,
    ).toEqual(["local draft"]);
  });

  it("keeps guest mode local without querying signed runs", async () => {
    syncPracticeRuntimeOwner(null);

    await bootstrapPracticeRuntimeCloud(null, catalog);

    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.fetchLatest).not.toHaveBeenCalled();
    expect(usePracticeRuntimeCloud.getState()).toEqual({
      ownerId: null,
      enabled: false,
      status: "ready",
    });
  });
});

function startLocal(ownerId: string): void {
  syncPracticeRuntimeOwner(ownerId);
  expect(
    usePracticeRuntime.getState().start({
      assignment: {
        runId,
        blueprintVersion: catalog.blueprintVersion,
        contentRevision: revision("f"),
        tasks: catalog.tasks,
      },
      startedAt,
    }),
  ).toBe(true);
}

function cloudRun(ownerId: string): PracticeCloudRun {
  return {
    runId,
    runOwnerId: ownerId,
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: revision("f"),
    startedAt,
    checkpointVersion: 0,
    currentIndex: 0,
    activeDurationMs: null,
    checkpointUpdatedAt: null,
    items: [
      {
        runItemId: "0aeadeca-cd74-53ad-9191-dc948153f3e5",
        task,
        attempts: [],
        draft: null,
      },
    ],
  };
}
