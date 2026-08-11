import { describe, expect, it } from "vitest";
import {
  emptySimulationState,
  migrateSimulationState,
  parsePersistedSimulationState,
} from "./simulation-persistence";
import { isSimulationActive } from "./simulation-store";
import type { SimulationTaskView } from "./simulation-types";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.UTC(2026, 7, 10, 10);

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
  it("accepts a bounded active run and rejects incompatible answers", () => {
    expect(parsePersistedSimulationState(runningState())).toMatchObject({
      runId,
      phase: "running",
      currentIndex: 0,
    });
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
});
