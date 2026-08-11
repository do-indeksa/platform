import { describe, expect, it } from "vitest";
import type { JournalAttempt } from "./attempt-journal";
import { mergeTaskHistory, recentHistoryErrorTaskIds } from "./history-journal";
import type { TaskHistoryEntry } from "./task-history";

const REVISION = `sha256:${"a".repeat(64)}`;

function journal(
  id: string,
  overrides: Partial<JournalAttempt> = {},
): JournalAttempt {
  return {
    id,
    taskId: "kb-001",
    examPosition: 1,
    mode: "practice",
    startedAt: "2026-07-12T09:59:50.000Z",
    submittedAt: "2026-07-12T10:00:00.000Z",
    activeDurationMs: 10_000,
    answer: '["2","3"]',
    outcome: "INCORRECT",
    helpLevel: 0,
    gradingKind: "AUTO",
    taskRevision: REVISION,
    ...overrides,
  };
}

function local(overrides: Partial<TaskHistoryEntry> = {}): TaskHistoryEntry {
  return {
    id: "b8b70648-4249-4474-bb6b-ef1b6db05f55",
    taskId: "kb-001",
    slot: 1,
    source: "practice",
    outcome: "incorrect",
    answers: ["2", "3"],
    helpLevel: 2,
    at: "2026-07-12T10:00:01.000Z",
    ...overrides,
  };
}

describe("mergeTaskHistory", () => {
  it("replaces a duplicate local row with its rich server attempt", () => {
    const serverId = "cb973bed-6f86-410b-89fa-26bedc57cf1e";

    expect(mergeTaskHistory([local()], [journal(serverId)])).toEqual([
      {
        id: serverId,
        taskId: "kb-001",
        slot: 1,
        source: "practice",
        outcome: "incorrect",
        answers: ["2", "3"],
        helpLevel: 2,
        at: "2026-07-12T10:00:00.000Z",
        startedAt: "2026-07-12T09:59:50.000Z",
        activeDurationMs: 10_000,
        gradingKind: "AUTO",
        taskRevision: REVISION,
      },
    ]);
  });

  it("keeps cross-device and unmatched local rows newest first", () => {
    const entries = mergeTaskHistory(
      [
        local({
          id: "81214e0d-5b5a-4ae9-bc71-636e39e76c64",
          taskId: "local-only",
          at: "2026-07-12T09:00:00.000Z",
        }),
      ],
      [
        journal("f79c08dc-927a-4d85-a0d8-1959e38c30bd", {
          taskId: "server-only",
          submittedAt: "2026-07-12T11:00:00.000Z",
          outcome: "PARTIAL",
          earnedPoints: 3,
          maxPoints: 6,
        }),
        journal("a5710d22-9114-4812-bc6e-eab62d59691f", {
          taskId: "not-graded",
          submittedAt: "2026-07-12T10:30:00.000Z",
          answer: undefined,
          outcome: "UNGRADED",
          gradingKind: "HUMAN",
        }),
      ],
    );

    expect(entries.map(({ taskId, outcome }) => ({ taskId, outcome }))).toEqual(
      [
        { taskId: "server-only", outcome: "partial" },
        { taskId: "not-graded", outcome: "ungraded" },
        { taskId: "local-only", outcome: "incorrect" },
      ],
    );
    expect(entries[0]).toMatchObject({ earnedPoints: 3, maxPoints: 6 });
    expect(entries[1].answers).toEqual([""]);
  });

  it("preserves a non-JSON answer instead of dropping the attempt", () => {
    const [entry] = mergeTaskHistory(
      [],
      [
        journal("0733355b-c1e7-4b77-be6e-660306debd21", {
          answer: "x = 2",
        }),
      ],
    );

    expect(entry.answers).toEqual(["x = 2"]);
  });
});

describe("recentHistoryErrorTaskIds", () => {
  it("includes partial work once and ignores ungraded or skipped rows", () => {
    const entries = mergeTaskHistory(
      [],
      [
        journal("cc67bd48-ff31-47e9-9b2d-a7aa0ad87aee"),
        journal("7f3e7f58-f3e4-48f6-9c4d-8d040cad647a", {
          outcome: "PARTIAL",
        }),
        journal("f9062c9f-f792-4595-9aef-2cc595083a0b", {
          taskId: "kb-002",
          outcome: "UNGRADED",
        }),
      ],
    );

    expect(recentHistoryErrorTaskIds(entries)).toEqual(["kb-001"]);
  });
});
