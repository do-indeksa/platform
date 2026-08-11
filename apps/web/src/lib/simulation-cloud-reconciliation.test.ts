import { describe, expect, it } from "vitest";
import type { SimulationCloudRun } from "./simulation-cloud-parser";
import {
  mergeSimulationCloudState,
  reconcileSimulationCloudState,
} from "./simulation-cloud-reconciliation";
import {
  emptySimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import type { SimulationTaskView } from "./simulation-types";

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

describe("simulation cloud reconciliation", () => {
  it("discovers remote work unless it is the stale copy of a completed run", () => {
    expect(reconcileSimulationCloudState(emptySimulationState(), cloud())).toBe(
      "discover",
    );
    expect(
      reconcileSimulationCloudState(
        { ...local(), phase: "done", endsAt: null, submittedAt: startedAt },
        cloud(),
      ),
    ).toBe("ignore-completed");
    expect(
      reconcileSimulationCloudState(
        { ...local(), phase: "done", endsAt: null, submittedAt: startedAt },
        cloud({ runId: crypto.randomUUID() }),
      ),
    ).toBe("discover");
  });

  it("merges disjoint local and remote drafts at the newest server version", () => {
    const localState = local({
      checkpointVersion: 2,
      answers: [["local"], ...Array.from({ length: 9 }, () => [""])],
      currentIndex: 1,
      savedAt: startedAt + 1_000,
    });
    const remote = cloud({
      checkpointVersion: 3,
      answers: [[""], ["remote"], ...Array.from({ length: 8 }, () => [""])],
      currentIndex: 2,
      savedAt: startedAt + 2_000,
    });

    expect(reconcileSimulationCloudState(localState, remote)).toBe("merge");
    expect(mergeSimulationCloudState(localState, remote)).toMatchObject({
      checkpointVersion: 3,
      answers: [
        ["local"],
        ["remote"],
        ...Array.from({ length: 8 }, () => [""]),
      ],
      currentIndex: 2,
      savedAt: startedAt + 2_000,
    });
  });

  it("promotes an interrupted remote upload to submitting", () => {
    const merged = mergeSimulationCloudState(
      local({ answers: [["42"], ...Array(9).fill([""])] }),
      cloud({
        answers: [["42"], ...Array(9).fill([""])],
        phase: "submitting",
      }),
    );

    expect(merged?.phase).toBe("submitting");
    expect(merged?.answers[0]).toEqual(["42"]);
  });

  it("does not mix device-only drafts into a remote submission", () => {
    const localState = local({
      answers: [["42"], ["device-only"], ...Array(8).fill([""])],
    });
    const remote = cloud({
      answers: [["42"], ...Array(9).fill([""])],
      phase: "submitting",
    });

    expect(mergeSimulationCloudState(localState, remote)).toBeNull();
  });

  it.each([
    [
      "run",
      (remote: SimulationCloudRun) =>
        (remote.runtime.runId = crypto.randomUUID()),
    ],
    [
      "owner",
      (remote: SimulationCloudRun) =>
        (remote.runtime.runOwnerId = crypto.randomUUID()),
    ],
    [
      "revision",
      (remote: SimulationCloudRun) =>
        (remote.runtime.tasks[0].revision = revision("e")),
    ],
    [
      "newer local version",
      (remote: SimulationCloudRun) => (remote.runtime.checkpointVersion = 1),
    ],
    [
      "same-task answer",
      (remote: SimulationCloudRun) => {
        remote.runtime.answers[0] = ["remote"];
      },
    ],
  ])(
    "surfaces a %s conflict without overwriting local state",
    (_name, mutate) => {
      const localState = local({
        checkpointVersion: 2,
        answers: [["local"], ...Array.from({ length: 9 }, () => [""])],
      });
      const remote = cloud({
        checkpointVersion: 2,
        answers: [["local"], ...Array.from({ length: 9 }, () => [""])],
      });
      mutate(remote);

      expect(reconcileSimulationCloudState(localState, remote)).toBe(
        "conflict",
      );
      expect(mergeSimulationCloudState(localState, remote)).toBeNull();
    },
  );
});

function local(
  overrides: Partial<PersistedSimulationState> = {},
): PersistedSimulationState {
  return {
    ...emptySimulationState(),
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 2,
    blueprintVersion: "2026.1",
    contentRevision: revision("f"),
    tasks,
    answers: Array.from({ length: 10 }, () => [""]),
    skipped: Array(10).fill(false),
    phase: "running",
    startedAt,
    endsAt: startedAt + 240 * 60_000,
    ...overrides,
  };
}

function cloud(
  overrides: Partial<SimulationCloudRun["runtime"]> = {},
): SimulationCloudRun {
  return {
    runtime: {
      runId,
      runOwnerId: ownerId,
      checkpointVersion: 2,
      blueprintVersion: "2026.1",
      contentRevision: revision("f"),
      tasks: tasks.map((task) => ({
        id: task.id,
        revision: task.revision,
        slot: task.slot,
        topic: task.topic,
        answerPartCount: task.fields.length,
        examPosition: task.examPosition,
        maxPoints: task.maxPoints,
      })),
      answers: Array.from({ length: 10 }, () => [""]),
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
