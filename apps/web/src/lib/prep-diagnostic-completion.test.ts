import { describe, expect, it } from "vitest";
import { prepDiagnosticCompletion } from "./prep-diagnostic-completion";

const dayStartMs = Date.parse("2026-08-13T00:00:00.000Z");
const dayEndMs = Date.parse("2026-08-14T00:00:00.000Z");

describe("preparation diagnostic completion", () => {
  it("has no baseline without a completed local or remote run", () => {
    expect(completion()).toEqual({ completed: false, completedToday: false });
    expect(
      completion({ localPhase: "running", localCompletedAt: dayStartMs }),
    ).toEqual({
      completed: false,
      completedToday: false,
    });
  });

  it("uses the local completion time instead of the run start time", () => {
    expect(
      completion({
        localPhase: "done",
        localCompletedAt: dayStartMs + 1,
      }),
    ).toEqual({ completed: true, completedToday: true });
  });

  it("restores a prior remote diagnostic baseline without completing today", () => {
    expect(
      completion({
        latestSubmittedDiagnostic: marker("2026-08-12T23:59:59.999Z"),
      }),
    ).toEqual({ completed: true, completedToday: false });
  });

  it("restores a diagnostic submitted today on another device", () => {
    expect(
      completion({
        latestSubmittedDiagnostic: marker("2026-08-13T12:00:00.000Z"),
      }),
    ).toEqual({ completed: true, completedToday: true });
  });
});

function completion(
  overrides: Partial<Parameters<typeof prepDiagnosticCompletion>[0]> = {},
) {
  return prepDiagnosticCompletion({
    localPhase: null,
    localCompletedAt: null,
    latestSubmittedDiagnostic: null,
    dayStartMs,
    dayEndMs,
    ...overrides,
  });
}

function marker(submittedAt: string) {
  return {
    id: "5ff78318-3436-4b4e-99b8-77ef34366ad3",
    kind: "DIAGNOSTIC" as const,
    submittedAt,
  };
}
