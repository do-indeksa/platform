import { describe, expect, it, vi } from "vitest";
import {
  createPendingPracticeAttempt,
  parseAttemptJournalResponse,
  parseRecordAttemptResponse,
  parseStoredAttempt,
} from "./attempt-journal";

const REVISION = `sha256:${"a".repeat(64)}`;
const ATTEMPT_ID = "cb973bed-6f86-410b-89fa-26bedc57cf1e";
const OWNER_ID = "a0209703-275b-4c6e-b815-25025b923ae8";

function pending() {
  return {
    taskId: "kb-001",
    slot: 1,
    correct: true,
    source: "practice",
    helpLevel: 1,
    at: "2026-07-12T10:00:00.000Z",
    transport: "graphql-standalone",
    ownerId: OWNER_ID,
    input: {
      id: ATTEMPT_ID,
      standalone: {
        taskId: "kb-001",
        examPosition: 1,
        taskRevision: REVISION,
      },
      startedAt: "2026-07-12T09:59:50.000Z",
      submittedAt: "2026-07-12T10:00:00.000Z",
      activeDurationMs: 10_000,
      answer: '["2"]',
      outcome: "CORRECT",
      helpLevel: 1,
      gradingKind: "AUTO",
    },
  };
}

describe("createPendingPracticeAttempt", () => {
  it("creates the complete standalone GraphQL input", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(ATTEMPT_ID);

    expect(
      createPendingPracticeAttempt(
        {
          taskId: "kb-001",
          slot: 1,
          taskRevision: REVISION,
          startedAt: "2026-07-12T09:59:50.000Z",
          submittedAt: "2026-07-12T10:00:00.000Z",
          activeDurationMs: 10_000,
          answer: '["2"]',
          outcome: "CORRECT",
          helpLevel: 1,
        },
        OWNER_ID,
      ),
    ).toEqual(pending());
  });

  it("rejects impossible time ranges and untrusted revisions", () => {
    expect(
      createPendingPracticeAttempt(
        {
          taskId: "kb-001",
          slot: 1,
          taskRevision: "latest",
          startedAt: "2026-07-12T10:00:01.000Z",
          submittedAt: "2026-07-12T10:00:00.000Z",
          outcome: "CORRECT",
          helpLevel: 0,
        },
        null,
      ),
    ).toBeNull();
  });
});

describe("parseStoredAttempt", () => {
  it("round-trips a valid pending attempt", () => {
    expect(parseStoredAttempt(pending())).toEqual(pending());
  });

  it.each([
    { ownerId: "not-a-uuid" },
    { input: { ...pending().input, id: "not-a-uuid" } },
    {
      input: {
        ...pending().input,
        standalone: { ...pending().input.standalone, taskRevision: "latest" },
      },
    },
    { taskId: "different-task" },
    { correct: false },
  ])("rejects corrupt linked metadata: %o", (override) => {
    expect(parseStoredAttempt({ ...pending(), ...override })).toBeNull();
  });

  it("normalizes a pre-ownership GraphQL run fallback", () => {
    expect(
      parseStoredAttempt({
        taskId: "kb-001",
        slot: 1,
        correct: true,
        source: "diagnostic",
        helpLevel: 0,
        at: "2026-07-12T10:00:00.000Z",
        transport: "graphql",
        runId: "5ff78318-3436-4b4e-99b8-77ef34366ad3",
      }),
    ).toMatchObject({ ownerId: null });
  });

  it("rejects permissive Date.parse values outside RFC 3339", () => {
    expect(
      parseStoredAttempt({
        taskId: "kb-001",
        slot: 1,
        correct: true,
        source: "practice",
        helpLevel: 0,
        at: "1",
      }),
    ).toBeNull();
  });
});

describe("GraphQL response parsing", () => {
  it("projects only graded mastery outcomes while validating every row", () => {
    const rows = [
      {
        id: ATTEMPT_ID,
        taskId: "kb-001",
        examPosition: 1,
        mode: "PRACTICE",
        submittedAt: "2026-07-12T10:00:00.000Z",
        outcome: "CORRECT",
        helpLevel: 1,
      },
      {
        id: "c4f8fe8b-8898-4dc8-8e67-15837b1fdb91",
        taskId: "kb-002",
        examPosition: 2,
        mode: "PRACTICE",
        submittedAt: "2026-07-12T10:01:00.000Z",
        outcome: "SKIPPED",
        helpLevel: 3,
      },
    ];

    expect(
      parseAttemptJournalResponse({ data: { attempts: rows } }, 10),
    ).toEqual([
      {
        id: ATTEMPT_ID,
        attempt: {
          taskId: "kb-001",
          slot: 1,
          correct: true,
          source: "practice",
          helpLevel: 1,
          at: "2026-07-12T10:00:00.000Z",
        },
      },
    ]);
  });

  it("rejects duplicate IDs, malformed rows, limits, and GraphQL errors", () => {
    const row = {
      id: ATTEMPT_ID,
      taskId: "kb-001",
      examPosition: 1,
      mode: "PRACTICE",
      submittedAt: "2026-07-12T10:00:00.000Z",
      outcome: "CORRECT",
      helpLevel: 0,
    };
    expect(
      parseAttemptJournalResponse({ data: { attempts: [row, row] } }, 10),
    ).toBeNull();
    expect(
      parseAttemptJournalResponse(
        { data: { attempts: [{ ...row, outcome: "UNKNOWN" }] } },
        10,
      ),
    ).toBeNull();
    expect(
      parseAttemptJournalResponse({ data: { attempts: [row] } }, 0),
    ).toBeNull();
    expect(
      parseAttemptJournalResponse(
        { data: null, errors: [{ message: "denied" }] },
        10,
      ),
    ).toBeNull();
  });

  it("accepts only the expected mutation id", () => {
    expect(
      parseRecordAttemptResponse(
        { data: { recordAttempt: { id: ATTEMPT_ID } } },
        ATTEMPT_ID,
      ),
    ).toBe(true);
    expect(
      parseRecordAttemptResponse(
        { data: { recordAttempt: { id: OWNER_ID } } },
        ATTEMPT_ID,
      ),
    ).toBe(false);
  });
});
