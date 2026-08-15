import { describe, expect, it } from "vitest";
import {
  materializeSimulationCloudRun,
  parseActiveSimulationRunIds,
  parseSimulationCloudRun,
} from "./simulation-cloud-parser";
import {
  progressAttemptId,
  progressRubricAttemptId,
  progressRunItemId,
} from "./progress-run";
import type { ProgressCloudCatalog } from "./progress-cloud-types";
import type { SimulationTaskView } from "./simulation-types";

const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = "2026-08-10T10:00:00.000Z";
const submittedAt = "2026-08-10T10:03:00.000Z";
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const catalog: ProgressCloudCatalog = {
  blueprintVersion: "ftn-p1:2026.1",
  durationMinutes: 240,
  taskCount: 10,
  maxPoints: 60,
  positions: Array.from({ length: 10 }, (_, index) => ({
    ordinal: index + 1,
    examPosition: index + 1,
    maxPoints: 6,
    candidates: [
      {
        id: `task-${index + 1}`,
        revision: revision(((index + 1) % 10).toString()),
        slot: index + 1,
        topic: `topic-${index + 1}`,
        answerPartCount: index === 2 ? 2 : 1,
      },
    ],
  })),
};

describe("simulation cloud parser", () => {
  it("restores a full mutable checkpoint without exposing task content", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(4, [
      draft(run, 0, '["42"]'),
      draft(run, 1, '[""]'),
      draft(run, 2, '["1","2"]'),
    ]);

    const parsed = parseSimulationCloudRun(run, catalog, ownerId);
    expect(parsed).toEqual({
      runtime: {
        runId,
        runOwnerId: ownerId,
        checkpointVersion: 3,
        blueprintVersion: "2026.1",
        contentRevision: revision("f"),
        tasks: catalog.positions.map((position) => ({
          ...position.candidates[0],
          examPosition: position.examPosition,
          maxPoints: position.maxPoints,
        })),
        answers: [
          ["42"],
          [""],
          ["1", "2"],
          ...Array.from({ length: 7 }, () => [""]),
        ],
        skipped: [false, true, ...Array(8).fill(false)],
        rubricScores: [],
        phase: "running",
        startedAt: Date.parse(startedAt),
        endsAt: Date.parse("2026-08-10T14:00:00.000Z"),
        submittedAt: null,
        currentIndex: 3,
        savedAt: Date.parse("2026-08-10T10:02:00.000Z"),
        timedOut: false,
      },
      checkpointUpdatedAt: "2026-08-10T10:02:00.000Z",
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /statementHtml|solutionHtml|correctAnswer|gradingRule/i,
    );
  });

  it("materializes compact cloud state only against the canonical task views", () => {
    const parsed = parseSimulationCloudRun(cloudRun(), catalog, ownerId);
    expect(parsed).not.toBeNull();

    const materialized = materializeSimulationCloudRun(
      parsed!,
      "2026.1",
      revision("f"),
      taskViews(),
    );
    expect(materialized).toMatchObject({
      runId,
      phase: "running",
      checkpointVersion: 0,
      blueprintVersion: "2026.1",
    });
    expect(materialized?.tasks[0].statementHtml).toBe("<p>Task 1</p>");
    expect(
      materializeSimulationCloudRun(
        parsed!,
        "2026.1",
        revision("e"),
        taskViews(),
      ),
    ).toBeNull();
    expect(
      materializeSimulationCloudRun(
        parsed!,
        "2026.1",
        revision("f"),
        taskViews().with(0, { ...taskViews()[0], revision: revision("e") }),
      ),
    ).toBeNull();
  });

  it("recovers a sequential interrupted completed upload as submitting", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(3, [
      draft(run, 0, '["42"]'),
      draft(run, 1, '[""]'),
      draft(run, 2, '["1","2"]'),
    ]);
    addAttempt(run, 0, "CORRECT", '["42"]', 6);
    addAttempt(run, 1, "SKIPPED", null, null);

    expect(
      parseSimulationCloudRun(run, catalog, ownerId)?.runtime,
    ).toMatchObject({
      phase: "submitting",
      checkpointVersion: 3,
      answers: [["42"], [""], ["1", "2"], ...Array(7).fill([""])],
      skipped: [false, true, ...Array(8).fill(false)],
      currentIndex: 2,
      timedOut: false,
    });
  });

  it("recovers a later rubric attempt without replacing the submitted answer", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(2, [
      draft(run, 0, '["42"]'),
      draft(run, 1, '["wrong"]'),
    ]);
    addAttempt(run, 0, "CORRECT", '["42"]', 6);
    addAttempt(run, 1, "INCORRECT", '["wrong"]', 0);
    addRubricAttempt(run, 1, 4, '["wrong"]');

    expect(
      parseSimulationCloudRun(run, catalog, ownerId)?.runtime,
    ).toMatchObject({
      phase: "submitting",
      submittedAt: Date.parse(submittedAt),
      answers: [
        ["42"],
        ["wrong"],
        ["", ""],
        ...Array.from({ length: 7 }, () => [""]),
      ],
      rubricScores: [null, 4, ...Array(8).fill(null)],
    });
  });

  it("recovers a mutable rubric score before the final rubric attempt", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(1, [
      draft(
        run,
        0,
        JSON.stringify({
          version: 1,
          answers: ["wrong"],
          rubricScore: 4,
        }),
      ),
    ]);
    addAttempt(run, 0, "INCORRECT", '["wrong"]', 0);

    expect(
      parseSimulationCloudRun(run, catalog, ownerId)?.runtime,
    ).toMatchObject({
      phase: "submitting",
      answers: [
        ["wrong"],
        [""],
        ["", ""],
        ...Array.from({ length: 7 }, () => [""]),
      ],
      rubricScores: [4, ...Array(9).fill(null)],
    });
  });

  it("keeps an unanswered final answer eligible for rubric partial credit", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(1, [draft(run, 0, '[""]')]);
    addAttempt(run, 0, "SKIPPED", null, null);
    addRubricAttempt(run, 0, 3, '[""]');

    expect(
      parseSimulationCloudRun(run, catalog, ownerId)?.runtime,
    ).toMatchObject({
      phase: "submitting",
      answers: [[""], [""], ["", ""], ...Array.from({ length: 7 }, () => [""])],
      skipped: [true, ...Array(9).fill(false)],
      rubricScores: [3, ...Array(9).fill(null)],
    });
  });

  it("rejects a partial completed upload without its draft checkpoint", () => {
    const run = cloudRun();
    addAttempt(run, 0, "CORRECT", '["42"]', 6);

    expect(parseSimulationCloudRun(run, catalog, ownerId)).toBeNull();
  });

  it.each([
    ["wrong blueprint", (run: CloudRun) => (run.blueprintVersion = "old")],
    ["terminal run", (run: CloudRun) => (run.status = "SUBMITTED")],
    ["wrong points", (run: CloudRun) => (run.items[0].maxPoints = 5)],
    [
      "wrong answer part snapshot",
      (run: CloudRun) => (run.items[0].answerPartCount = 2),
    ],
    [
      "wrong deadline",
      (run: CloudRun) => (run.deadlineAt = "2026-08-10T13:00:00.000Z"),
    ],
    [
      "oversized run duration",
      (run: CloudRun) => (run.activeDurationMs = 4 * 60 * 60 * 1_000 + 1),
    ],
    [
      "oversized checkpoint duration",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, []);
        run.checkpoint.activeDurationMs = 4 * 60 * 60 * 1_000 + 1;
      },
    ],
    [
      "oversized attempt duration",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, [draft(run, 0, '["42"]')]);
        addAttempt(run, 0, "CORRECT", '["42"]', 6);
        run.items[0].recentAttempts[0].activeDurationMs =
          4 * 60 * 60 * 1_000 + 1;
      },
    ],
    [
      "attempt after a gap",
      (run: CloudRun) => addAttempt(run, 1, "SKIPPED", null, null),
    ],
    [
      "duplicate checkpoint draft",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, [
          draft(run, 0, '["42"]'),
          draft(run, 0, '["42"]'),
        ]);
      },
    ],
    [
      "attempt that differs from its checkpoint",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, [draft(run, 0, '["41"]')]);
        addAttempt(run, 0, "CORRECT", '["42"]', 6);
      },
    ],
    [
      "oversized draft answer",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, [
          draft(run, 0, JSON.stringify(["x".repeat(201)])),
        ]);
      },
    ],
    [
      "rubric attempt that differs from its mutable checkpoint",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1, [
          draft(
            run,
            0,
            JSON.stringify({
              version: 1,
              answers: ["wrong"],
              rubricScore: 4,
            }),
          ),
        ]);
        addAttempt(run, 0, "INCORRECT", '["wrong"]', 0);
        addRubricAttempt(run, 0, 3, '["wrong"]');
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const run = cloudRun();
    mutate(run);
    expect(parseSimulationCloudRun(run, catalog, ownerId)).toBeNull();
  });

  it("selects only active simulation summaries and rejects malformed pages", () => {
    expect(
      parseActiveSimulationRunIds(
        [
          { id: runId, kind: "SIMULATION", status: "ACTIVE", startedAt },
          {
            id: crypto.randomUUID(),
            kind: "DIAGNOSTIC",
            status: "ACTIVE",
            startedAt,
          },
          {
            id: crypto.randomUUID(),
            kind: "SIMULATION",
            status: "SUBMITTED",
            startedAt,
          },
        ],
        100,
      ),
    ).toEqual([runId]);
    expect(
      parseActiveSimulationRunIds(
        [{ id: "bad", kind: "SIMULATION", status: "ACTIVE", startedAt }],
        100,
      ),
    ).toBeNull();
  });
});

type CloudCheckpoint = {
  version: number;
  currentOrdinal: number;
  activeDurationMs: number | null;
  updatedAt: string;
  drafts: { runItemId: string; answer: string }[];
};

type CloudRun = {
  id: string;
  kind: string;
  status: string;
  blueprintVersion: string;
  contentRevision: string;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  activeDurationMs: number | null;
  checkpoint: CloudCheckpoint | null;
  items: {
    id: string;
    taskId: string;
    ordinal: number;
    examPosition: number;
    topic: string;
    maxPoints: number;
    answerPartCount: number | null;
    taskRevision: string;
    recentAttempts: Record<string, unknown>[];
  }[];
};

function cloudRun(): CloudRun {
  return {
    id: runId,
    kind: "SIMULATION",
    status: "ACTIVE",
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: revision("f"),
    startedAt,
    deadlineAt: null,
    submittedAt: null,
    activeDurationMs: null,
    checkpoint: null,
    items: catalog.positions.map((position) => {
      const task = position.candidates[0];
      return {
        id: progressRunItemId(runId, task.id),
        taskId: task.id,
        ordinal: position.ordinal,
        examPosition: position.examPosition,
        topic: task.topic,
        maxPoints: position.maxPoints,
        answerPartCount: task.answerPartCount,
        taskRevision: task.revision,
        recentAttempts: [],
      };
    }),
  };
}

function checkpoint(
  currentOrdinal: number,
  drafts: CloudCheckpoint["drafts"],
): CloudCheckpoint {
  return {
    version: 3,
    currentOrdinal,
    activeDurationMs: 90_000,
    updatedAt: "2026-08-10T10:02:00.000Z",
    drafts,
  };
}

function draft(run: CloudRun, index: number, answer: string) {
  return { runItemId: run.items[index].id, answer };
}

function addAttempt(
  run: CloudRun,
  index: number,
  outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
  answer: string | null,
  earnedPoints: number | null,
): void {
  const item = run.items[index];
  const task = catalog.positions[index].candidates[0];
  item.recentAttempts = [
    {
      id: progressAttemptId(item.id),
      runItemId: item.id,
      taskId: task.id,
      examPosition: item.examPosition,
      mode: "SIMULATION",
      startedAt,
      submittedAt,
      activeDurationMs: null,
      answer,
      outcome,
      helpLevel: 0,
      gradingKind: "AUTO",
      earnedPoints,
      maxPoints: item.maxPoints,
      taskRevision: task.revision,
    },
  ];
}

function addRubricAttempt(
  run: CloudRun,
  index: number,
  earnedPoints: number,
  answer: string,
): void {
  const item = run.items[index];
  const task = catalog.positions[index].candidates[0];
  item.recentAttempts.push({
    id: progressRubricAttemptId(item.id),
    runItemId: item.id,
    taskId: task.id,
    examPosition: item.examPosition,
    mode: "SIMULATION",
    startedAt,
    submittedAt,
    activeDurationMs: null,
    answer,
    outcome: "PARTIAL",
    helpLevel: 0,
    gradingKind: "RUBRIC_SELF",
    earnedPoints,
    maxPoints: item.maxPoints,
    taskRevision: task.revision,
  });
}

function taskViews(): SimulationTaskView[] {
  return catalog.positions.map((position) => {
    const task = position.candidates[0];
    return {
      id: task.id,
      revision: task.revision,
      slot: task.slot,
      examPosition: position.examPosition,
      maxPoints: position.maxPoints,
      topic: task.topic,
      topicName: `Topic ${position.examPosition}`,
      statementHtml: `<p>Task ${position.examPosition}</p>`,
      fields: Array.from({ length: task.answerPartCount }, () => ({
        kind: "value" as const,
      })),
    };
  });
}
