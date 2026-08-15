import { describe, expect, it } from "vitest";
import {
  parseActivePracticeRunIds,
  parsePracticeCloudRun,
  resolvePracticeCloudAssignment,
} from "./practice-cloud-parser";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import type {
  PracticeCloudAssignment,
  PracticeCloudCatalog,
} from "./practice-cloud-types";

const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = "2026-08-12T10:00:00.000Z";
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const contentRevision =
  "sha256:86c961a236f6c615a8db24b074be906e217b222635badba9fb02dbe641c8012a";
const assignment: PracticeCloudAssignment = {
  runId,
  blueprintVersion: "ftn-p1:2026.1",
  contentRevision,
  tasks: [
    {
      id: "kb-001",
      revision: revision("a"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 2,
    },
    {
      id: "kb-002",
      revision: revision("b"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 1,
    },
  ],
};
const catalog: PracticeCloudCatalog = {
  blueprintVersion: assignment.blueprintVersion,
  tasks: assignment.tasks,
};

describe("practice cloud parser", () => {
  it("restores ordered retries and current drafts for repeated positions", () => {
    const run = cloudRun();
    addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 0, 60_000);
    addAttempt(run, 0, 2, "CORRECT", ["3", "4"], 1, 120_000);
    run.checkpoint = checkpoint(run, 2, [
      draft(run, 0, 2, ["3", "4"], 1),
      draft(run, 1, 1, ["draft"], 0),
    ]);

    expect(parsePracticeCloudRun(run, assignment, ownerId)).toEqual({
      runId,
      runOwnerId: ownerId,
      blueprintVersion: assignment.blueprintVersion,
      contentRevision: assignment.contentRevision,
      startedAt: Date.parse(startedAt),
      checkpointVersion: 3,
      currentIndex: 1,
      activeDurationMs: 90_000,
      checkpointUpdatedAt: "2026-08-12T10:02:30.000Z",
      items: [
        {
          runItemId: run.items[0].id,
          task: assignment.tasks[0],
          attempts: [
            expectedAttempt(run, 0, 1, "incorrect", ["1", "2"], 0, 60_000),
            expectedAttempt(run, 0, 2, "correct", ["3", "4"], 1, 120_000),
          ],
          draft: {
            nextAttempt: 2,
            answers: ["3", "4"],
            helpLevel: 1,
            stale: true,
          },
        },
        {
          runItemId: run.items[1].id,
          task: assignment.tasks[1],
          attempts: [],
          draft: {
            nextAttempt: 1,
            answers: ["draft"],
            helpLevel: 0,
            stale: false,
          },
        },
      ],
    });
  });

  it("hydrates an assignment from the current content catalog", () => {
    const run = cloudRun();
    addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 0, 60_000);
    const resolved = resolvePracticeCloudAssignment(run, catalog);

    expect(resolved).toEqual(assignment);
    expect(
      parsePracticeCloudRun(run, resolved as PracticeCloudAssignment, ownerId),
    ).toEqual(parsePracticeCloudRun(run, assignment, ownerId));
  });

  it("uses the first unfinished item without a checkpoint", () => {
    const run = cloudRun();
    addAttempt(run, 0, 1, "CORRECT", ["1", "2"], 0, 60_000);

    expect(parsePracticeCloudRun(run, assignment, ownerId)).toMatchObject({
      checkpointVersion: 0,
      currentIndex: 1,
      activeDurationMs: null,
      checkpointUpdatedAt: null,
    });
  });

  it("accepts a server checkpoint within the client clock-skew window", () => {
    const run = cloudRun();
    run.checkpoint = checkpoint(run, 1, []);
    run.checkpoint.updatedAt = new Date(
      Date.parse(startedAt) - 2 * 60_000,
    ).toISOString();

    expect(parsePracticeCloudRun(run, assignment, ownerId)).toMatchObject({
      checkpointVersion: 3,
      currentIndex: 0,
      activeDurationMs: 90_000,
      checkpointUpdatedAt: run.checkpoint.updatedAt,
    });
  });

  it.each([
    [
      "wrong content revision",
      (run: CloudRun) => (run.contentRevision = revision("e")),
    ],
    [
      "wrong item revision",
      (run: CloudRun) => (run.items[0].taskRevision = revision("e")),
    ],
    ["wrong item order", (run: CloudRun) => run.items.reverse()],
    [
      "arbitrary retry ID",
      (run: CloudRun) => {
        addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 0, 60_000);
        run.items[0].recentAttempts[0].id = crypto.randomUUID();
      },
    ],
    [
      "attempt after terminal",
      (run: CloudRun) => {
        addAttempt(run, 0, 1, "CORRECT", ["1", "2"], 0, 60_000);
        addAttempt(run, 0, 2, "INCORRECT", ["3", "4"], 0, 120_000);
      },
    ],
    [
      "decreasing help",
      (run: CloudRun) => {
        addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 2, 60_000);
        addAttempt(run, 0, 2, "INCORRECT", ["3", "4"], 1, 120_000);
      },
    ],
    [
      "overlapping global attempts",
      (run: CloudRun) => {
        addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 0, 120_000);
        addAttempt(run, 1, 1, "INCORRECT", ["3"], 0, 90_000);
      },
    ],
    [
      "equal global submission millisecond",
      (run: CloudRun) => {
        addAttempt(run, 0, 1, "INCORRECT", ["1", "2"], 0, 60_000);
        addAttempt(run, 1, 1, "INCORRECT", ["3"], 0, 60_000);
      },
    ],
    [
      "checkpoint before the client clock-skew window",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(run, 1, []);
        run.checkpoint.updatedAt = new Date(
          Date.parse(startedAt) - 5 * 60_000 - 1,
        ).toISOString();
      },
    ],
    [
      "draft with the wrong next attempt",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(run, 1, [draft(run, 0, 2, ["", ""], 0)]);
      },
    ],
    [
      "draft with an unknown field",
      (run: CloudRun) => {
        run.checkpoint = checkpoint(run, 1, [
          {
            runItemId: run.items[0].id,
            answer: JSON.stringify({
              version: 1,
              nextAttempt: 1,
              answers: ["", ""],
              helpLevel: 0,
              extra: true,
            }),
          },
        ]);
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const run = cloudRun();
    mutate(run);
    expect(parsePracticeCloudRun(run, assignment, ownerId)).toBeNull();
  });

  it("selects only active practice summaries and rejects malformed pages", () => {
    expect(
      parseActivePracticeRunIds(
        [
          { id: runId, kind: "PRACTICE", status: "ACTIVE", startedAt },
          {
            id: crypto.randomUUID(),
            kind: "DIAGNOSTIC",
            status: "ACTIVE",
            startedAt,
          },
          {
            id: crypto.randomUUID(),
            kind: "PRACTICE",
            status: "SUBMITTED",
            startedAt,
          },
        ],
        100,
      ),
    ).toEqual([runId]);
    expect(
      parseActivePracticeRunIds(
        [{ id: "bad", kind: "PRACTICE", status: "ACTIVE", startedAt }],
        100,
      ),
    ).toBeNull();
  });
});

type CloudAttempt = {
  id: string;
  runItemId: string;
  taskId: string;
  examPosition: number;
  mode: string;
  startedAt: string;
  submittedAt: string;
  activeDurationMs: number;
  answer: string;
  outcome: string;
  helpLevel: number;
  gradingKind: string;
  taskRevision: string;
};

type CloudRun = {
  id: string;
  kind: string;
  status: string;
  blueprintVersion: string;
  contentRevision: string;
  startedAt: string;
  checkpoint: {
    version: number;
    currentOrdinal: number;
    activeDurationMs: number;
    updatedAt: string;
    drafts: { runItemId: string; answer: string }[];
  } | null;
  items: {
    id: string;
    taskId: string;
    ordinal: number;
    examPosition: number;
    topic: string;
    answerPartCount: number;
    taskRevision: string;
    recentAttempts: CloudAttempt[];
  }[];
};

function cloudRun(): CloudRun {
  return {
    id: runId,
    kind: "PRACTICE",
    status: "ACTIVE",
    blueprintVersion: assignment.blueprintVersion,
    contentRevision: assignment.contentRevision,
    startedAt,
    checkpoint: null,
    items: assignment.tasks.map((task, index) => ({
      id: progressRunItemId(runId, task.id),
      taskId: task.id,
      ordinal: index + 1,
      examPosition: task.slot,
      topic: task.topic,
      answerPartCount: task.answerPartCount,
      taskRevision: task.revision,
      recentAttempts: [],
    })),
  };
}

function addAttempt(
  run: CloudRun,
  itemIndex: number,
  number: number,
  outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
  answers: string[],
  helpLevel: number,
  submittedOffset: number,
): void {
  const item = run.items[itemIndex];
  const previousSubmittedAt = run.items
    .flatMap((candidate) => candidate.recentAttempts)
    .map((attempt) => Date.parse(attempt.submittedAt))
    .toSorted((left, right) => left - right)
    .at(-1);
  const attemptStartedAt = previousSubmittedAt ?? Date.parse(startedAt);
  const submittedAt = Date.parse(startedAt) + submittedOffset;
  item.recentAttempts.push({
    id: progressPracticeAttemptId(item.id, number),
    runItemId: item.id,
    taskId: item.taskId,
    examPosition: item.examPosition,
    mode: "PRACTICE",
    startedAt: new Date(attemptStartedAt).toISOString(),
    submittedAt: new Date(submittedAt).toISOString(),
    activeDurationMs: Math.max(0, submittedAt - attemptStartedAt),
    answer: JSON.stringify(answers),
    outcome,
    helpLevel,
    gradingKind: "AUTO",
    taskRevision: item.taskRevision,
  });
}

function checkpoint(
  run: CloudRun,
  currentOrdinal: number,
  drafts: { runItemId: string; answer: string }[],
) {
  return {
    version: 3,
    currentOrdinal,
    activeDurationMs: 90_000,
    updatedAt: "2026-08-12T10:02:30.000Z",
    drafts,
  };
}

function draft(
  run: CloudRun,
  itemIndex: number,
  nextAttempt: number,
  answers: string[],
  helpLevel: number,
) {
  return {
    runItemId: run.items[itemIndex].id,
    answer: JSON.stringify({ version: 1, nextAttempt, answers, helpLevel }),
  };
}

function expectedAttempt(
  run: CloudRun,
  itemIndex: number,
  number: number,
  outcome: "correct" | "incorrect" | "skipped",
  answers: string[],
  helpLevel: number,
  submittedOffset: number,
) {
  const raw = run.items[itemIndex].recentAttempts[number - 1];
  return {
    id: progressPracticeAttemptId(run.items[itemIndex].id, number),
    number,
    startedAt: Date.parse(raw.startedAt),
    submittedAt: Date.parse(startedAt) + submittedOffset,
    activeDurationMs: raw.activeDurationMs,
    answers,
    outcome,
    helpLevel,
  };
}
