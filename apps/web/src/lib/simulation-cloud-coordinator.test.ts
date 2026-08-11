import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulationCloudRun } from "./simulation-cloud-parser";
import {
  bootstrapSimulationCloud,
  chooseCloudSimulationVersion,
  hydrateDiscoveredSimulationRun,
  keepLocalSimulationVersion,
  scheduleSimulationCloudUpload,
  useSimulationCloud,
} from "./simulation-cloud-sync";
import {
  emptySimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import { useSimulation } from "./simulation-store";
import type { ProgressCloudCatalog } from "./progress-cloud-types";
import type { SimulationTaskView } from "./simulation-types";

const mocks = vi.hoisted(() => ({
  abandon: vi.fn(),
  fetchLatest: vi.fn(),
  fetchRun: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("./simulation-cloud-client", () => ({
  SimulationGraphQLError: class SimulationGraphQLError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  abandonSimulationCloudRun: mocks.abandon,
  fetchLatestSimulationCloudRun: mocks.fetchLatest,
  fetchSimulationCloudRun: mocks.fetchRun,
  uploadSimulationCloudRun: mocks.upload,
}));

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const remoteRunId = "ee9c127f-f044-4561-8690-ea610d8de01f";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const startedAt = Date.parse("2026-08-10T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const tasks: SimulationTaskView[] = Array.from({ length: 10 }, (_, index) => ({
  id: `task-${index + 1}`,
  revision: revision(((index + 1) % 10).toString()),
  slot: index + 1,
  examPosition: index + 1,
  maxPoints: 6,
  topic: `topic-${index + 1}`,
  topicName: `Topic ${index + 1}`,
  statementHtml: `<p>Task ${index + 1}</p>`,
  fields: [{ kind: "value" }],
}));
const catalog: ProgressCloudCatalog = {
  blueprintVersion: "ftn-p1:2026.1",
  durationMinutes: 240,
  taskCount: 10,
  maxPoints: 60,
  positions: tasks.map((task, index) => ({
    ordinal: index + 1,
    examPosition: task.examPosition,
    maxPoints: task.maxPoints,
    candidates: [
      {
        id: task.id,
        revision: task.revision,
        slot: task.slot,
        topic: task.topic,
        answerPartCount: task.fields.length,
      },
    ],
  })),
};

afterEach(async () => {
  await bootstrapSimulationCloud(null, catalog);
  useSimulation.setState({
    ...emptySimulationState(),
    authOwnerId: undefined,
  });
  mocks.abandon.mockReset();
  mocks.fetchLatest.mockReset();
  mocks.fetchRun.mockReset();
  mocks.upload.mockReset();
});

describe("simulation cloud coordinator", () => {
  it("discovers compact remote work and hydrates only matching task views", async () => {
    useSimulation.setState({
      ...emptySimulationState(),
      authOwnerId: ownerId,
    });
    mocks.fetchLatest.mockResolvedValueOnce(cloud());

    await bootstrapSimulationCloud(ownerId, catalog);
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "ready",
      remote: { runtime: { runId } },
    });
    expect(useSimulation.getState().phase).toBeNull();

    expect(
      hydrateDiscoveredSimulationRun(runId, "2026.1", revision("f"), tasks),
    ).toBe(true);
    expect(useSimulation.getState()).toMatchObject({
      runId,
      runOwnerId: ownerId,
      phase: "running",
    });
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "ready",
      remote: null,
    });
  });

  it("offers a different remote run after preserving the local result", async () => {
    useSimulation.setState({
      ...activeState("local-result"),
      phase: "done",
      endsAt: null,
      submittedAt: startedAt + 1_000,
      authOwnerId: ownerId,
    });
    mocks.fetchLatest.mockResolvedValueOnce(cloud({ runId: remoteRunId }));

    await bootstrapSimulationCloud(ownerId, catalog);

    expect(useSimulation.getState()).toMatchObject({
      phase: null,
      runId: null,
    });
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "ready",
      remote: { runtime: { runId: remoteRunId } },
    });
  });

  it("keeps queued writes blocked through conflict and failed recovery", async () => {
    const local = activeState("local");
    useSimulation.setState({ ...local, authOwnerId: ownerId });
    mocks.fetchLatest.mockResolvedValueOnce(
      cloud({ answers: answers("remote") }),
    );

    await bootstrapSimulationCloud(ownerId, catalog);
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "conflict",
      recoveryFailed: false,
    });
    scheduleSimulationCloudUpload(upload(local), true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.abandon.mockRejectedValueOnce(new Error("offline"));
    await expect(keepLocalSimulationVersion()).resolves.toBe(false);
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "conflict",
      recoveryFailed: true,
    });
    expect(useSimulation.getState()).toMatchObject({
      runId,
      answers: answers("local"),
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("abandons a colliding server run before forking the device copy", async () => {
    const local = activeState("local");
    useSimulation.setState({ ...local, authOwnerId: ownerId });
    mocks.fetchLatest.mockResolvedValueOnce(
      cloud({ answers: answers("remote") }),
    );
    mocks.abandon.mockResolvedValueOnce(undefined);

    await bootstrapSimulationCloud(ownerId, catalog);
    await expect(keepLocalSimulationVersion()).resolves.toBe(true);
    expect(mocks.abandon).toHaveBeenCalledWith(runId, expect.any(AbortSignal));
    expect(useSimulation.getState()).toMatchObject({
      phase: "running",
      checkpointVersion: 0,
      answers: answers("local"),
    });
    expect(useSimulation.getState().runId).not.toBe(runId);
  });

  it("never clears device work before the old run is safely abandoned", async () => {
    const local = activeState("local");
    useSimulation.setState({ ...local, authOwnerId: ownerId });
    mocks.fetchLatest.mockResolvedValueOnce(
      cloud({ runId: remoteRunId, answers: answers("remote") }),
    );
    mocks.abandon.mockRejectedValueOnce(new Error("offline"));

    await bootstrapSimulationCloud(ownerId, catalog);
    await expect(chooseCloudSimulationVersion()).resolves.toBe(false);
    expect(useSimulation.getState()).toMatchObject({
      phase: "running",
      runId,
      answers: answers("local"),
    });

    mocks.abandon.mockResolvedValueOnce(undefined);
    await expect(chooseCloudSimulationVersion()).resolves.toBe(true);
    expect(useSimulation.getState()).toMatchObject({
      phase: null,
      runId: null,
    });
    expect(useSimulationCloud.getState()).toMatchObject({
      status: "ready",
      remote: { runtime: { runId: remoteRunId } },
    });
  });
});

function activeState(firstAnswer: string): PersistedSimulationState {
  return {
    ...emptySimulationState(),
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 0,
    blueprintVersion: "2026.1",
    contentRevision: revision("f"),
    tasks,
    answers: answers(firstAnswer),
    skipped: Array(10).fill(false),
    phase: "running",
    startedAt,
    endsAt: startedAt + 240 * 60_000,
  };
}

function cloud(
  overrides: Partial<SimulationCloudRun["runtime"]> = {},
): SimulationCloudRun {
  return {
    runtime: {
      runId,
      runOwnerId: ownerId,
      checkpointVersion: 0,
      blueprintVersion: "2026.1",
      contentRevision: revision("f"),
      tasks: catalog.positions.map((position) => ({
        ...position.candidates[0],
        examPosition: position.examPosition,
        maxPoints: position.maxPoints,
      })),
      answers: answers(""),
      skipped: Array(10).fill(false),
      phase: "running",
      startedAt,
      endsAt: startedAt + 240 * 60_000,
      currentIndex: 0,
      savedAt: null,
      timedOut: false,
      ...overrides,
    },
    checkpointUpdatedAt: null,
  };
}

function answers(first: string): string[][] {
  return [[first], ...Array.from({ length: 9 }, () => [""])];
}

function upload(state: PersistedSimulationState) {
  return {
    state,
    tasks: tasks.map((task) => ({
      taskId: task.id,
      taskRevision: task.revision,
      slot: task.slot,
      examPosition: task.examPosition,
      topic: task.topic,
      maxPoints: task.maxPoints,
    })),
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: revision("f"),
  };
}
