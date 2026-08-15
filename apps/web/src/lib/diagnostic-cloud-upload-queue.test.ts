import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticCloudUpload } from "./diagnostic-cloud-client";
import { DiagnosticCloudUploadQueue } from "./diagnostic-cloud-upload-queue";
import {
  useDiagnostic,
  type PersistedDiagnosticState,
} from "./diagnostic-store";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock("./diagnostic-cloud-client", () => ({
  DiagnosticGraphQLError: class DiagnosticGraphQLError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  uploadDiagnosticCloudRun: mocks.upload,
}));

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const taskIds = [
  "kb-001",
  "kv-001",
  "eks-001",
  "log-001",
  "trig-001",
  "vek-001",
  "plan-001",
  "ster-001",
  "fun-001",
  "komb-001",
];

afterEach(() => {
  mocks.upload.mockReset();
  useDiagnostic.getState().reset();
});

describe("diagnostic cloud upload queue", () => {
  it("waits for an explicit retry after failure and keeps the newest state", async () => {
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
    const queue = new DiagnosticCloudUploadQueue({
      isCurrent: () => true,
      setStatus,
      setReady,
      exposeConflict: vi.fn(async () => false),
    });
    const initial = activeState();
    useDiagnostic.setState({ ...initial, authOwnerId: ownerId });

    queue.schedule(upload(initial), initial, context, true);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));

    const latest = {
      ...initial,
      answers: initial.answers.with(0, ["newer"]),
    };
    useDiagnostic.setState(latest);
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
    const queue = new DiagnosticCloudUploadQueue({
      isCurrent: () => true,
      setStatus,
      setReady: vi.fn(),
      exposeConflict,
    });
    const state = activeState();
    useDiagnostic.setState({ ...state, authOwnerId: ownerId });

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

function activeState(): PersistedDiagnosticState {
  return {
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 0,
    taskIds,
    slots: Array.from({ length: taskIds.length }, (_, index) => index + 1),
    answers: taskIds.map(() => [""]),
    outcomes: taskIds.map(() => null),
    completedAt: taskIds.map(() => null),
    phase: "running",
    currentIndex: 0,
    startedAt: Date.UTC(2026, 7, 10),
  };
}

function upload(state: PersistedDiagnosticState): DiagnosticCloudUpload {
  return {
    state,
    tasks: taskIds.map((id, index) => ({
      id,
      revision: `sha256:${String(index).padStart(2, "0").repeat(32)}`,
      slot: index + 1,
      examPosition: index + 1,
      topic: `topic-${index + 1}`,
      answerPartCount: 1,
    })),
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: `sha256:${"f".repeat(64)}`,
  };
}
