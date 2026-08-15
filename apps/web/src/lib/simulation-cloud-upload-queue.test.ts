import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SimulationGraphQLError,
  type SimulationCloudUpload,
} from "./simulation-cloud-client";
import { SimulationCloudUploadQueue } from "./simulation-cloud-upload-queue";
import {
  emptySimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import { useSimulation } from "./simulation-store";
import type { SimulationTaskView } from "./simulation-types";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("./simulation-cloud-client", () => ({
  SimulationGraphQLError: class SimulationGraphQLError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  uploadSimulationCloudRun: mocks.upload,
}));

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
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

afterEach(() => {
  mocks.upload.mockReset();
  useSimulation.setState({
    ...emptySimulationState(),
    authOwnerId: undefined,
  });
});

describe("simulation cloud upload queue", () => {
  it("waits for explicit retry after failure and keeps the newest state", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    mocks.upload
      .mockImplementationOnce(
        () =>
          new Promise<number>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(1);
    const setStatus = vi.fn();
    const setReady = vi.fn();
    const context = { ownerId, controller: new AbortController() };
    const queue = new SimulationCloudUploadQueue({
      isCurrent: () => true,
      setStatus,
      setReady,
      exposeConflict: vi.fn(async () => false),
    });
    const initial = activeState();
    useSimulation.setState({ ...initial, authOwnerId: ownerId });

    queue.schedule(upload(initial), initial, context, true);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const latest = {
      ...initial,
      answers: initial.answers.with(0, ["newer"]),
    };
    useSimulation.setState(latest);
    queue.schedule(upload(latest), latest, context, false);
    rejectFirst?.(new Error("offline"));

    await vi.waitFor(() =>
      expect(setStatus).toHaveBeenLastCalledWith("offline"),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.upload).toHaveBeenCalledTimes(1);

    queue.retryAll(context);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload.mock.calls[1][0].state.answers[0]).toEqual(["newer"]);
    expect(setReady).toHaveBeenCalledWith(context);
    queue.clear();
  });

  it("retries a mergeable conflict with the reconciled drafts", async () => {
    mocks.upload
      .mockRejectedValueOnce(
        new SimulationGraphQLError("checkpoint changed", "CONFLICT"),
      )
      .mockResolvedValueOnce(4);
    const context = { ownerId, controller: new AbortController() };
    const initial = {
      ...activeState(),
      answers: activeState().answers.with(0, ["local"]),
    };
    useSimulation.setState({ ...initial, authOwnerId: ownerId });
    const exposeConflict = vi.fn(async () => {
      const current = useSimulation.getState();
      useSimulation.setState({
        ...current,
        checkpointVersion: 3,
        answers: current.answers.with(1, ["remote"]),
      });
      return true;
    });
    const queue = new SimulationCloudUploadQueue({
      isCurrent: () => true,
      setStatus: vi.fn(),
      setReady: vi.fn(),
      exposeConflict,
    });

    queue.schedule(upload(initial), initial, context, true);

    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(exposeConflict).toHaveBeenCalledWith(runId, context, "CONFLICT");
    expect(mocks.upload.mock.calls[1][0].state).toMatchObject({
      checkpointVersion: 3,
      answers: [["local"], ["remote"], ...Array(8).fill([""])],
    });
    expect(useSimulation.getState().checkpointVersion).toBe(4);
    queue.clear();
  });

  it("discards a finished run even when its in-flight upload fails", async () => {
    let rejectUpload: ((error: Error) => void) | undefined;
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    const setStatus = vi.fn();
    const exposeConflict = vi.fn(async () => false);
    const context = { ownerId, controller: new AbortController() };
    const queue = new SimulationCloudUploadQueue({
      isCurrent: () => true,
      setStatus,
      setReady: vi.fn(),
      exposeConflict,
    });
    const state = activeState();
    useSimulation.setState({ ...state, authOwnerId: ownerId });

    queue.schedule(upload(state), state, context, true);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    queue.finish(runId);
    rejectUpload?.(new Error("superseded by completed upload"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(setStatus.mock.calls).toEqual([["syncing"]]);
    expect(exposeConflict).not.toHaveBeenCalled();
    queue.retryAll(context);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    queue.clear();
  });
});

function activeState(): PersistedSimulationState {
  return {
    ...emptySimulationState(),
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 0,
    blueprintVersion: "2026.1",
    contentRevision: revision("f"),
    tasks,
    answers: Array.from({ length: 10 }, () => [""]),
    skipped: Array(10).fill(false),
    phase: "running",
    startedAt,
    endsAt: startedAt + 240 * 60_000,
  };
}

function upload(state: PersistedSimulationState): SimulationCloudUpload {
  return {
    state,
    tasks: tasks.map((task) => ({
      taskId: task.id,
      taskRevision: task.revision,
      slot: task.slot,
      examPosition: task.examPosition,
      topic: task.topic,
      maxPoints: task.maxPoints,
      answerPartCount: task.fields.length,
    })),
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: revision("f"),
  };
}
