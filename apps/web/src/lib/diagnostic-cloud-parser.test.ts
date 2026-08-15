import { describe, expect, it } from "vitest";
import {
  parseActiveDiagnosticRunIds,
  parseDiagnosticCloudRun,
} from "./diagnostic-cloud-parser";
import type { DiagnosticCloudCatalog } from "./diagnostic-cloud-types";
import { progressAttemptId, progressRunItemId } from "./progress-run";

const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = "2026-08-10T10:00:00.000Z";
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const catalog: DiagnosticCloudCatalog = {
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
        answerPartCount: index === 1 ? 2 : 1,
      },
    ],
  })),
};

describe("diagnostic cloud parser", () => {
  it("restores a sequential current diagnostic and its bounded draft", () => {
    const run = cloudRun();
    addAttempt(run, 0, "CORRECT", '["42"]', "2026-08-10T10:01:00.000Z");
    addAttempt(run, 1, "INCORRECT", '["1","2"]', "2026-08-10T10:02:00.000Z");
    run.checkpoint = {
      version: 3,
      currentOrdinal: 3,
      activeDurationMs: 90_000,
      updatedAt: "2026-08-10T10:02:30.000Z",
      drafts: [
        {
          runItemId: run.items[2].id,
          answer: '["draft"]',
        },
      ],
    };

    expect(parseDiagnosticCloudRun(run, catalog, ownerId)).toEqual({
      runtime: {
        runId,
        runOwnerId: ownerId,
        checkpointVersion: 3,
        taskIds: catalog.positions.map((position) => position.candidates[0].id),
        slots: Array.from({ length: 10 }, (_, index) => index + 1),
        answers: [
          ["42"],
          ["1", "2"],
          ["draft"],
          ...Array.from({ length: 7 }, () => [""]),
        ],
        outcomes: ["correct", "incorrect", ...Array(8).fill(null)],
        completedAt: [
          Date.parse("2026-08-10T10:01:00.000Z"),
          Date.parse("2026-08-10T10:02:00.000Z"),
          ...Array(8).fill(null),
        ],
        phase: "running",
        currentIndex: 2,
        startedAt: Date.parse(startedAt),
      },
      blueprintVersion: catalog.blueprintVersion,
      contentRevision: revision("f"),
      checkpointUpdatedAt: "2026-08-10T10:02:30.000Z",
    });
  });

  it("accepts an idempotently started run before its first checkpoint", () => {
    const parsed = parseDiagnosticCloudRun(cloudRun(), catalog, ownerId);

    expect(parsed?.runtime).toMatchObject({
      checkpointVersion: 0,
      currentIndex: 0,
      outcomes: Array(10).fill(null),
    });
  });

  it("restores a fully attempted active run so submit can be retried", () => {
    const run = cloudRun();
    for (let index = 0; index < 10; index += 1) {
      addAttempt(
        run,
        index,
        "INCORRECT",
        JSON.stringify(
          Array(catalog.positions[index].candidates[0].answerPartCount).fill(
            "0",
          ),
        ),
        new Date(Date.parse(startedAt) + (index + 1) * 60_000).toISOString(),
      );
    }
    run.checkpoint = checkpoint(3);

    expect(
      parseDiagnosticCloudRun(run, catalog, ownerId)?.runtime,
    ).toMatchObject({
      phase: "done",
      currentIndex: 9,
      checkpointVersion: 1,
      outcomes: Array(10).fill("incorrect"),
    });
  });

  it.each([
    ["wrong blueprint", (run: CloudRun) => (run.blueprintVersion = "old")],
    [
      "wrong task revision",
      (run: CloudRun) => (run.items[0].taskRevision = revision("e")),
    ],
    [
      "wrong answer part snapshot",
      (run: CloudRun) => (run.items[0].answerPartCount = 2),
    ],
    [
      "wrong deterministic item id",
      (run: CloudRun) => (run.items[0].id = crypto.randomUUID()),
    ],
    ["terminal run", (run: CloudRun) => (run.status = "SUBMITTED")],
    [
      "future attempt before a gap",
      (run: CloudRun) =>
        addAttempt(run, 1, "SKIPPED", null, "2026-08-10T10:01:00.000Z"),
    ],
    [
      "wrong checkpoint ordinal",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(2);
      },
    ],
    [
      "draft for another item",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1);
        run.checkpoint.drafts = [
          { runItemId: run.items[1].id, answer: '["x"]' },
        ];
      },
    ],
    [
      "oversized answer",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(1);
        run.checkpoint.drafts = [
          {
            runItemId: run.items[0].id,
            answer: JSON.stringify(["x".repeat(201)]),
          },
        ];
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const run = cloudRun();
    mutate(run);
    expect(parseDiagnosticCloudRun(run, catalog, ownerId)).toBeNull();
  });

  it("selects only active diagnostic summaries and rejects malformed pages", () => {
    expect(
      parseActiveDiagnosticRunIds(
        [
          { id: runId, kind: "DIAGNOSTIC", status: "ACTIVE", startedAt },
          {
            id: crypto.randomUUID(),
            kind: "SIMULATION",
            status: "ACTIVE",
            startedAt,
          },
          {
            id: crypto.randomUUID(),
            kind: "DIAGNOSTIC",
            status: "SUBMITTED",
            startedAt,
          },
        ],
        100,
      ),
    ).toEqual([runId]);
    expect(
      parseActiveDiagnosticRunIds(
        [{ id: "bad", kind: "DIAGNOSTIC", status: "ACTIVE", startedAt }],
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
  checkpoint: CloudCheckpoint | null;
  items: {
    id: string;
    taskId: string;
    ordinal: number;
    examPosition: number;
    topic: string;
    answerPartCount: number | null;
    taskRevision: string;
    recentAttempts: Record<string, unknown>[];
  }[];
};

function cloudRun(): CloudRun {
  return {
    id: runId,
    kind: "DIAGNOSTIC",
    status: "ACTIVE",
    blueprintVersion: catalog.blueprintVersion,
    contentRevision: revision("f"),
    startedAt,
    checkpoint: null,
    items: catalog.positions.map((position) => {
      const task = position.candidates[0];
      return {
        id: progressRunItemId(runId, task.id),
        taskId: task.id,
        ordinal: position.ordinal,
        examPosition: position.examPosition,
        topic: task.topic,
        answerPartCount: task.answerPartCount,
        taskRevision: task.revision,
        recentAttempts: [] as Record<string, unknown>[],
      };
    }),
  };
}

function addAttempt(
  run: CloudRun,
  index: number,
  outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
  answer: string | null,
  submittedAt: string,
): void {
  const item = run.items[index];
  const task = catalog.positions[index].candidates[0];
  const previousSubmittedAt =
    index === 0
      ? startedAt
      : (run.items[index - 1].recentAttempts[0]?.submittedAt as string);
  item.recentAttempts = [
    {
      id: progressAttemptId(item.id),
      runItemId: item.id,
      taskId: task.id,
      examPosition: index + 1,
      mode: "DIAGNOSTIC",
      startedAt: previousSubmittedAt,
      submittedAt,
      answer,
      outcome,
      helpLevel: 0,
      gradingKind: "AUTO",
      taskRevision: task.revision,
    },
  ];
}

function checkpoint(currentOrdinal: number): CloudCheckpoint {
  return {
    version: 1,
    currentOrdinal,
    activeDurationMs: null,
    updatedAt: "2026-08-10T10:01:00.000Z",
    drafts: [] as { runItemId: string; answer: string }[],
  };
}
