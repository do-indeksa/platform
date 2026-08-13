import { describe, expect, it } from "vitest";
import {
  HISTORY_RUN_LIMIT,
  parseHistoryRunResponse,
  parseHistoryRunSummary,
  parseSubmittedRunSummary,
} from "./history-run-summary";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    kind: "PRACTICE",
    status: "SUBMITTED",
    blueprintVersion: "practice-v1",
    contentRevision: `sha256:${"a".repeat(64)}`,
    startedAt: "2026-08-10T10:00:00.000Z",
    submittedAt: "2026-08-10T10:20:00.000Z",
    activeDurationMs: 1_100_000,
    taskIds: ["kb-001", "kv-001"],
    itemCount: 2,
    completedItemCount: 2,
    correctItemCount: 1,
    earnedPoints: null,
    maxPoints: null,
    ...overrides,
  };
}

describe("history run summaries", () => {
  it("parses a complete nullable-score summary", () => {
    const expected = {
      id: runId,
      kind: "PRACTICE",
      status: "SUBMITTED",
      blueprintVersion: "practice-v1",
      contentRevision: `sha256:${"a".repeat(64)}`,
      startedAt: "2026-08-10T10:00:00.000Z",
      submittedAt: "2026-08-10T10:20:00.000Z",
      activeDurationMs: 1_100_000,
      taskIds: ["kb-001", "kv-001"],
      itemCount: 2,
      completedItemCount: 2,
      correctItemCount: 1,
    };
    expect(parseHistoryRunSummary(run())).toEqual(expected);
  });

  it.each([
    { status: "SUBMITTED", submittedAt: null },
    { status: "ACTIVE", submittedAt: "2026-08-10T10:20:00.000Z" },
    { taskIds: ["kb-001", "kb-001"] },
    { taskIds: ["kb-001"], itemCount: 2 },
    { completedItemCount: 3 },
    { correctItemCount: 3 },
    { earnedPoints: 7, maxPoints: 6 },
    { activeDurationMs: -1 },
    { blueprintVersion: "" },
  ])("rejects an invalid aggregate %#", (invalid) => {
    expect(parseHistoryRunSummary(run(invalid))).toBeNull();
  });

  it("rejects duplicate IDs and oversized responses", () => {
    expect(
      parseHistoryRunResponse({
        data: { runs: [run(), run()], latestSubmittedDiagnostic: null },
      }),
    ).toBeNull();
    expect(
      parseHistoryRunResponse(
        { data: { runs: [run()], latestSubmittedDiagnostic: null } },
        HISTORY_RUN_LIMIT - HISTORY_RUN_LIMIT,
      ),
    ).toBeNull();
  });

  it("parses an explicit latest submitted diagnostic marker", () => {
    const marker = {
      id: runId,
      kind: "DIAGNOSTIC",
      submittedAt: "2026-08-10T10:20:00.000Z",
    };
    expect(parseSubmittedRunSummary(marker)).toEqual(marker);
    expect(
      parseHistoryRunResponse({
        data: { runs: [], latestSubmittedDiagnostic: marker },
      }),
    ).toEqual({ entries: [], latestSubmittedDiagnostic: marker });
  });

  it.each([
    undefined,
    { id: runId, kind: "PRACTICE", submittedAt: "2026-08-10T10:20:00.000Z" },
    {
      id: "invalid",
      kind: "DIAGNOSTIC",
      submittedAt: "2026-08-10T10:20:00.000Z",
    },
    { id: runId, kind: "DIAGNOSTIC", submittedAt: "invalid" },
  ])("rejects an invalid diagnostic marker %#", (marker) => {
    expect(
      parseHistoryRunResponse({
        data: { runs: [], latestSubmittedDiagnostic: marker },
      }),
    ).toBeNull();
  });

  it("rejects GraphQL errors", () => {
    expect(
      parseHistoryRunResponse({
        data: { runs: [run()], latestSubmittedDiagnostic: null },
        errors: [{ message: "failed" }],
      }),
    ).toBeNull();
  });
});
