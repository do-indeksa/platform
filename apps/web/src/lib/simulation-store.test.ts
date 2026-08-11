import { beforeEach, describe, expect, it } from "vitest";
import {
  emptySimulationState,
  migrateSimulationState,
  parsePersistedSimulationState,
} from "./simulation-persistence";
import {
  claimSimulationHistoryOwner,
  isSimulationActive,
  reconcileSimulationOwner,
  simulationHistoryForOwner,
  syncSimulationOwner,
  useSimulation,
} from "./simulation-store";
import type { SimulationTaskView } from "./simulation-types";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.UTC(2026, 7, 10, 10);
const userA = "a0209703-275b-4c6e-b815-25025b923ae8";
const userB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

const task: SimulationTaskView = {
  id: "kb-001",
  revision: `sha256:${"a".repeat(64)}`,
  slot: 1,
  examPosition: 1,
  maxPoints: 6,
  topic: "kompleksni-brojevi",
  topicName: "Complex numbers",
  statementHtml: "<p>Task</p>",
  fields: [{ kind: "value" }],
};

function runningState() {
  return {
    ...emptySimulationState(),
    runId,
    blueprintVersion: "2026.1",
    contentRevision: `sha256:${"b".repeat(64)}`,
    tasks: [task],
    answers: [[""]],
    skipped: [false],
    phase: "running" as const,
    startedAt,
    endsAt: startedAt + 4 * 60 * 60 * 1_000,
  };
}

describe("simulation persistence", () => {
  beforeEach(() => {
    useSimulation.setState({
      ...emptySimulationState(),
      authOwnerId: undefined,
    });
  });

  it("accepts a bounded active run and rejects incompatible answers", () => {
    expect(parsePersistedSimulationState(runningState())).toMatchObject({
      runId,
      phase: "running",
      currentIndex: 0,
    });
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        checkpointVersion: -1,
      }),
    ).toEqual(emptySimulationState());
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        answers: [["2", "extra"]],
      }),
    ).toEqual(emptySimulationState());

    const sixPartTask = {
      ...task,
      id: "kv-003",
      topic: "kvadratna-jednacina",
      fields: Array.from({ length: 6 }, () => ({ kind: "value" as const })),
    };
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        tasks: [sixPartTask],
        answers: [["1", "2", "3", "4", "5", "6"]],
      }),
    ).toMatchObject({
      phase: "running",
      answers: [["1", "2", "3", "4", "5", "6"]],
    });

    const sanitized = parsePersistedSimulationState({
      ...runningState(),
      tasks: [{ ...task, solutionHtml: "do not retain" }],
    });
    expect(sanitized.tasks[0]).not.toHaveProperty("solutionHtml");
  });

  it("accepts a complete result only when metrics match its outcomes", () => {
    const result = {
      taskId: task.id,
      outcome: "correct" as const,
      earnedPoints: 6,
      maxPoints: 6,
    };
    const entry = {
      id: runId,
      blueprintVersion: "2026.1",
      startedAt,
      finishedAt: startedAt + 60_000,
      durationMs: 60_000,
      timedOut: false,
      score: 6,
      maxPoints: 6,
      correctCount: 1,
      answeredCount: 1,
      taskIds: [task.id],
      answers: [["2"]],
      results: [result],
      progress: {
        contentRevision: `sha256:${"b".repeat(64)}`,
        items: [
          {
            taskId: task.id,
            taskRevision: task.revision,
            slot: task.slot,
            examPosition: task.examPosition,
            topic: task.topic,
            maxPoints: task.maxPoints,
          },
        ],
      },
    };
    const review = [
      {
        taskId: task.id,
        correctAnswer: "2",
        solution: "Solution",
      },
    ];
    const parsed = parsePersistedSimulationState({
      ...runningState(),
      answers: [["2"]],
      phase: "done",
      endsAt: null,
      submittedAt: entry.finishedAt,
      results: [result],
      review,
      history: [entry],
    });

    expect(parsed.history).toEqual([entry]);
    const ownerId = "a0209703-275b-4c6e-b815-25025b923ae8";
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        history: [{ ...entry, ownerId }],
      }).history,
    ).toEqual([{ ...entry, ownerId }]);
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        history: [{ ...entry, ownerId: "not-a-user-id" }],
      }).history,
    ).toEqual([]);
    const withUnknownHistoryData = parsePersistedSimulationState({
      ...runningState(),
      history: [{ ...entry, review: "do not retain" }],
    });
    expect(withUnknownHistoryData.history[0]).not.toHaveProperty("review");
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        answers: [["2"]],
        phase: "done",
        endsAt: null,
        submittedAt: entry.finishedAt,
        results: [result],
        review,
        history: [{ ...entry, score: 5 }],
      }).history,
    ).toEqual([]);
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        answers: [["2"]],
        phase: "done",
        endsAt: null,
        submittedAt: entry.finishedAt,
        results: [result],
        review: [{ ...review[0], taskId: "wrong-task" }],
        history: [entry],
      }),
    ).toEqual(emptySimulationState([entry]));
    expect(
      parsePersistedSimulationState({
        ...runningState(),
        answers: [["2"]],
        phase: "done",
        endsAt: null,
        submittedAt: entry.finishedAt,
        results: [result],
        review,
        history: [
          {
            ...entry,
            progress: {
              ...entry.progress,
              items: [{ ...entry.progress.items[0], taskRevision: "mutable" }],
            },
          },
        ],
      }).history,
    ).toEqual([]);
  });

  it("drops old active payloads but keeps bounded legacy summaries", () => {
    const migrated = migrateSimulationState(
      {
        phase: "grading",
        tasks: [{ ...task, answer: "2", solutionHtml: "secret" }],
        history: [{ finishedAt: startedAt, score: 42, taskIds: ["kb-001"] }],
      },
      4,
    );

    expect(migrated).toMatchObject({
      runId: null,
      phase: null,
      tasks: [],
      history: [
        {
          id: `legacy-${startedAt}`,
          score: 42,
          taskIds: ["kb-001"],
        },
      ],
    });
  });

  it("preserves full v5 history while dropping an active run without revisions", () => {
    const result = {
      taskId: task.id,
      outcome: "incorrect" as const,
      earnedPoints: 0,
      maxPoints: task.maxPoints,
    };
    const entry = {
      id: runId,
      blueprintVersion: "2026.1",
      startedAt,
      finishedAt: startedAt + 60_000,
      durationMs: 60_000,
      timedOut: false,
      score: 0,
      maxPoints: task.maxPoints,
      correctCount: 0,
      answeredCount: 1,
      taskIds: [task.id],
      answers: [["wrong"]],
      results: [result],
    };

    expect(
      migrateSimulationState(
        {
          ...runningState(),
          contentRevision: undefined,
          tasks: [{ ...task, revision: undefined }],
          history: [entry],
        },
        5,
      ),
    ).toEqual(emptySimulationState([entry]));
  });

  it("treats only running and submitting phases as active", () => {
    expect(isSimulationActive("running")).toBe(true);
    expect(isSimulationActive("submitting")).toBe(true);
    expect(isSimulationActive("done")).toBe(false);
    expect(isSimulationActive(null)).toBe(false);
  });

  it("isolates completed browser history by its claimed owner", () => {
    const entries = [
      { ...emptyHistoryEntry("guest"), ownerId: null },
      { ...emptyHistoryEntry("account-a"), ownerId: userA },
      { ...emptyHistoryEntry("account-b"), ownerId: userB },
    ];

    expect(simulationHistoryForOwner(entries, undefined)).toBeNull();
    expect(
      simulationHistoryForOwner(entries, null)?.map(({ id }) => id),
    ).toEqual(["guest"]);
    expect(
      simulationHistoryForOwner(entries, userA)?.map(({ id }) => id),
    ).toEqual(["account-a"]);
    expect(
      claimSimulationHistoryOwner(entries, userA).map(({ ownerId }) => ownerId),
    ).toEqual([userA, userA, userB]);
  });

  it("claims a guest runtime and clears foreign runtime without deleting history", () => {
    const guestHistory = {
      ...emptyHistoryEntry(`legacy-${startedAt}`),
      ownerId: null,
    };
    const accountBHistory = {
      ...emptyHistoryEntry(`legacy-${startedAt + 1}`),
      ownerId: userB,
    };
    const claimed = reconcileSimulationOwner(
      { ...runningState(), history: [guestHistory, accountBHistory] },
      userA,
    );

    expect(claimed).toMatchObject({
      ownerId: userA,
      runtime: { phase: "running", runOwnerId: userA },
    });
    expect(claimed.runtime.history.map(({ ownerId }) => ownerId)).toEqual([
      userA,
      userB,
    ]);

    const switched = reconcileSimulationOwner(claimed.runtime, userB);
    expect(switched.runtime).toMatchObject({ phase: null, runId: null });
    expect(switched.runtime.history).toHaveLength(2);
    expect(
      simulationHistoryForOwner(switched.runtime.history, userB)?.map(
        ({ id }) => id,
      ),
    ).toEqual([accountBHistory.id]);
    expect(
      reconcileSimulationOwner(claimed.runtime, null).runtime,
    ).toMatchObject({ phase: null, runId: null });
  });

  it("fails closed for invalid owners and legacy unowned runtime", () => {
    const history = [emptyHistoryEntry(`legacy-${startedAt}`)];
    expect(
      reconcileSimulationOwner(
        { ...runningState(), runOwnerId: userA, history },
        "not-a-user-id",
      ).runtime,
    ).toEqual(emptySimulationState(history));
    expect(migrateSimulationState({ ...runningState(), history }, 7)).toEqual(
      emptySimulationState(history),
    );
  });

  it("preserves a version-eight active run with checkpoint version zero", () => {
    const { checkpointVersion, ...legacy } = runningState();
    expect(checkpointVersion).toBe(0);

    expect(migrateSimulationState(legacy, 8)).toMatchObject({
      phase: "running",
      runId,
      checkpointVersion: 0,
    });
  });

  it("adopts a cloud version and forks an active run explicitly", () => {
    syncSimulationOwner(userA);
    useSimulation.getState().start({
      runId,
      blueprintVersion: "2026.1",
      contentRevision: `sha256:${"b".repeat(64)}`,
      durationMinutes: 240,
      tasks: [task],
    });

    expect(useSimulation.getState().adoptCheckpointVersion(runId, 4)).toBe(
      true,
    );
    expect(useSimulation.getState().adoptCheckpointVersion(runId, 3)).toBe(
      false,
    );
    const forkedId = crypto.randomUUID();
    expect(useSimulation.getState().fork(forkedId)).toBe(true);
    expect(useSimulation.getState()).toMatchObject({
      runId: forkedId,
      checkpointVersion: 0,
      phase: "running",
    });
  });

  it("restores an owner-scoped active cloud run without replacing history", () => {
    const history = [
      { ...emptyHistoryEntry(`legacy-${startedAt}`), ownerId: userA },
    ];
    syncSimulationOwner(userA);
    useSimulation.setState({ history });
    const restored = parsePersistedSimulationState({
      ...runningState(),
      runOwnerId: userA,
      checkpointVersion: 2,
      answers: [["2"]],
    });

    expect(useSimulation.getState().restore(restored)).toBe(true);
    expect(useSimulation.getState()).toMatchObject({
      runId,
      runOwnerId: userA,
      checkpointVersion: 2,
      phase: "running",
      answers: [["2"]],
      history,
    });
    expect(
      useSimulation.getState().restore({ ...restored, runOwnerId: userB }),
    ).toBe(false);
  });
});

function emptyHistoryEntry(id: string) {
  return {
    id,
    blueprintVersion: "legacy",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    timedOut: false,
    score: 0,
    maxPoints: 60,
    correctCount: 0,
    answeredCount: 0,
    taskIds: [task.id],
    answers: [],
    results: [],
  };
}
