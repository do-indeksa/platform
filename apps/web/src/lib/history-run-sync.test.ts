import { describe, expect, it } from "vitest";
import { parseHistoryRunSyncResponse } from "./history-run-sync";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const submittedAt = "2026-08-10T10:20:00.000Z";

describe("history run sync response", () => {
  it("parses a nullable latest submitted diagnostic marker", () => {
    expect(
      parseHistoryRunSyncResponse({
        data: {
          runs: [],
          latestSubmittedDiagnosticRun: { id: runId, submittedAt },
        },
      }),
    ).toEqual({
      entries: [],
      latestSubmittedDiagnosticRun: { id: runId, submittedAt },
    });
    expect(
      parseHistoryRunSyncResponse({
        data: { runs: [], latestSubmittedDiagnosticRun: null },
      }),
    ).toEqual({ entries: [], latestSubmittedDiagnosticRun: null });
  });

  it.each([
    undefined,
    { id: "not-a-uuid", submittedAt },
    { id: runId, submittedAt: "not-a-time" },
    { id: runId },
  ])("rejects an invalid diagnostic marker %#", (marker) => {
    expect(
      parseHistoryRunSyncResponse({
        data: { runs: [], latestSubmittedDiagnosticRun: marker },
      }),
    ).toBeNull();
  });

  it("rejects partial GraphQL success", () => {
    expect(
      parseHistoryRunSyncResponse({
        data: { runs: [], latestSubmittedDiagnosticRun: null },
        errors: [{ message: "marker failed" }],
      }),
    ).toBeNull();
  });
});
