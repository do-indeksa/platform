import { describe, expect, it } from "vitest";
import type { DiagnosticCloudRun } from "./diagnostic-cloud-parser";
import { reconcileDiagnosticCloudState } from "./diagnostic-cloud-reconciliation";
import type { PersistedDiagnosticState } from "./diagnostic-store";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const taskIds = Array.from({ length: 10 }, (_, index) => `task-${index + 1}`);
const startedAt = Date.parse("2026-08-10T10:00:00.000Z");

describe("diagnostic cloud reconciliation", () => {
  it("hydrates an empty device and ignores a locally completed result", () => {
    const remote = cloudRun(activeState());

    expect(reconcileDiagnosticCloudState(emptyState(), remote)).toBe("hydrate");
    expect(
      reconcileDiagnosticCloudState(
        { ...activeState(), phase: "done", currentIndex: 9 },
        remote,
      ),
    ).toBe("ignore-completed");
  });

  it("continues when the server is an exact prefix of local progress", () => {
    const local = activeState({
      checkpointVersion: 2,
      currentIndex: 2,
      answers: [["42"], ["next"], ...Array(8).fill([""])],
      outcomes: ["correct", "skipped", ...Array(8).fill(null)],
      completedAt: [
        startedAt + 60_000,
        startedAt + 120_000,
        ...Array(8).fill(null),
      ],
    });
    const remoteState = activeState({
      checkpointVersion: 3,
      currentIndex: 1,
      answers: [["42"], [""], ...Array(8).fill([""])],
      outcomes: ["correct", ...Array(9).fill(null)],
      completedAt: [startedAt + 60_000, ...Array(9).fill(null)],
    });

    expect(reconcileDiagnosticCloudState(local, cloudRun(remoteState))).toBe(
      "continue",
    );
  });

  it.each([
    [
      "a divergent draft",
      activeState({ answers: [["local"], ...Array(9).fill([""])] }),
      activeState({
        checkpointVersion: 2,
        answers: [["remote"], ...Array(9).fill([""])],
      }),
    ],
    [
      "a newer local checkpoint version",
      activeState({ checkpointVersion: 4 }),
      activeState({ checkpointVersion: 3 }),
    ],
    [
      "a different run",
      activeState(),
      activeState({ runId: "2fe0be1a-cda6-4885-b67b-d3db68c84f6b" }),
    ],
  ])("requires an explicit choice for %s", (_name, local, remote) => {
    expect(reconcileDiagnosticCloudState(local, cloudRun(remote))).toBe(
      "conflict",
    );
  });
});

function activeState(
  overrides: Partial<PersistedDiagnosticState> = {},
): PersistedDiagnosticState {
  return {
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 1,
    taskIds,
    slots: Array.from({ length: 10 }, (_, index) => index + 1),
    answers: Array.from({ length: 10 }, () => [""]),
    outcomes: Array(10).fill(null),
    completedAt: Array(10).fill(null),
    phase: "running",
    currentIndex: 0,
    startedAt,
    ...overrides,
  };
}

function emptyState(): PersistedDiagnosticState {
  return {
    runId: null,
    runOwnerId: null,
    checkpointVersion: 0,
    taskIds: [],
    slots: [],
    answers: [],
    outcomes: [],
    completedAt: [],
    phase: null,
    currentIndex: 0,
    startedAt: null,
  };
}

function cloudRun(runtime: PersistedDiagnosticState): DiagnosticCloudRun {
  return {
    runtime,
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: `sha256:${"f".repeat(64)}`,
    checkpointUpdatedAt: "2026-08-10T10:03:00.000Z",
  };
}
