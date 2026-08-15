import { describe, expect, it } from "vitest";
import { diagnosticBaselineCompletedAt } from "./diagnostic-baseline";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";

describe("diagnostic baseline completion", () => {
  it("uses the actual final local completion time instead of the start time", () => {
    expect(
      diagnosticBaselineCompletedAt(
        {
          phase: "done",
          completedAt: [100, 200, 300],
        },
        null,
      ),
    ).toBe(300);
  });

  it("combines local and remote evidence and keeps the latest completion", () => {
    expect(
      diagnosticBaselineCompletedAt(
        { phase: "done", completedAt: [100, 200] },
        {
          id: runId,
          submittedAt: "2026-08-10T10:20:00.000Z",
        },
      ),
    ).toBe(Date.parse("2026-08-10T10:20:00.000Z"));
  });

  it("ignores active local state and absent remote evidence", () => {
    expect(
      diagnosticBaselineCompletedAt(
        { phase: "running", completedAt: [100, null] },
        null,
      ),
    ).toBeNull();
  });
});
