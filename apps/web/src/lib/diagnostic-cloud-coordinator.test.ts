import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticCloudRun } from "./diagnostic-cloud-parser";
import {
  bootstrapDiagnosticCloud,
  keepLocalDiagnosticVersion,
  retryDiagnosticCloud,
  scheduleDiagnosticCloudUpload,
  useDiagnosticCloud,
} from "./diagnostic-cloud-sync";
import {
  useDiagnostic,
  type PersistedDiagnosticState,
} from "./diagnostic-store";
import type { DiagnosticCloudCatalog } from "./diagnostic-cloud-types";

const mocks = vi.hoisted(() => ({
  abandon: vi.fn(),
  fetchLatest: vi.fn(),
  fetchRun: vi.fn(),
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
  abandonDiagnosticCloudRun: mocks.abandon,
  fetchDiagnosticCloudRun: mocks.fetchRun,
  fetchLatestDiagnosticCloudRun: mocks.fetchLatest,
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
const catalog: DiagnosticCloudCatalog = {
  blueprintVersion: "ftn-p1:2026.1",
  durationMinutes: 240,
  taskCount: 10,
  maxPoints: 60,
  positions: taskIds.map((id, index) => ({
    ordinal: index + 1,
    examPosition: index + 1,
    maxPoints: 6,
    candidates: [
      {
        id,
        revision: revision(index),
        slot: index + 1,
        topic: `topic-${index + 1}`,
        answerPartCount: 1,
      },
    ],
  })),
};

afterEach(async () => {
  await bootstrapDiagnosticCloud(null, catalog);
  useDiagnostic.getState().reset();
  mocks.abandon.mockReset();
  mocks.fetchLatest.mockReset();
  mocks.fetchRun.mockReset();
  mocks.upload.mockReset();
});

describe("diagnostic cloud coordinator", () => {
  it("keeps queued writes blocked through conflict and failed recovery", async () => {
    const local = activeState("local");
    useDiagnostic.setState({ ...local, authOwnerId: ownerId });
    mocks.fetchLatest.mockRejectedValueOnce(new Error("offline"));
    await bootstrapDiagnosticCloud(ownerId, catalog);
    expect(useDiagnosticCloud.getState().status).toBe("offline");

    mocks.upload.mockRejectedValueOnce(new Error("offline"));
    scheduleDiagnosticCloudUpload(upload(local), true);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(useDiagnosticCloud.getState().status).toBe("offline"),
    );

    mocks.fetchLatest.mockResolvedValueOnce(cloudRun(activeState("remote")));
    await retryDiagnosticCloud();
    expect(useDiagnosticCloud.getState()).toMatchObject({
      status: "conflict",
      recoveryFailed: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.upload).toHaveBeenCalledTimes(1);

    mocks.abandon.mockRejectedValueOnce(new Error("offline"));
    await expect(keepLocalDiagnosticVersion()).resolves.toBe(false);
    expect(useDiagnosticCloud.getState()).toMatchObject({
      status: "conflict",
      recoveryFailed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});

function activeState(firstAnswer: string): PersistedDiagnosticState {
  return {
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 0,
    taskIds,
    slots: Array.from({ length: taskIds.length }, (_, index) => index + 1),
    answers: taskIds.map((_, index) => (index === 0 ? [firstAnswer] : [""])),
    outcomes: taskIds.map(() => null),
    completedAt: taskIds.map(() => null),
    phase: "running",
    currentIndex: 0,
    startedAt: Date.UTC(2026, 7, 10),
  };
}

function cloudRun(runtime: PersistedDiagnosticState): DiagnosticCloudRun {
  return {
    runtime,
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: `sha256:${"f".repeat(64)}`,
    checkpointUpdatedAt: "2026-08-10T10:03:00.000Z",
  };
}

function upload(state: PersistedDiagnosticState) {
  return {
    state,
    tasks: catalog.positions.map((position) => ({
      ...position.candidates[0],
      examPosition: position.examPosition,
    })),
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: `sha256:${"f".repeat(64)}`,
  };
}

function revision(index: number): string {
  return `sha256:${String(index).padStart(2, "0").repeat(32)}`;
}
