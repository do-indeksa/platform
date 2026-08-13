import { describe, expect, it } from "vitest";
import type { PracticeWorkspaceSnapshot } from "./practice-workspace-runtime";
import { taskDraftFromPracticeWorkspace } from "./practice-workspace-draft";

const startedAt = Date.parse("2026-08-12T10:00:00.000Z");

describe("practice workspace draft restoration", () => {
  it("leaves a new run to the legacy session draft", () => {
    expect(taskDraftFromPracticeWorkspace(snapshot(), 2)).toBeNull();
  });

  it("restores an edited retry as an unsaved form", () => {
    expect(
      taskDraftFromPracticeWorkspace(
        snapshot({
          attempts: [attempt("incorrect", ["old"], 0)],
          draft: { nextAttempt: 2, answers: ["new"], helpLevel: 0 },
        }),
        2,
      ),
    ).toEqual({
      answers: ["new"],
      view: "form",
      attempted: true,
      hintsShown: 0,
      solved: false,
      burned: false,
      dirty: true,
    });
  });

  it("restores advanced help without lowering the durable level", () => {
    expect(
      taskDraftFromPracticeWorkspace(
        snapshot({
          attempts: [attempt("incorrect", ["old"], 0)],
          draft: { nextAttempt: 2, answers: ["old"], helpLevel: 1 },
        }),
        2,
      ),
    ).toMatchObject({ view: "hint", hintsShown: 1, dirty: false });
  });

  it.each([
    ["correct", true, false, "correct"],
    ["skipped", false, true, "solution"],
  ] as const)(
    "restores a terminal %s attempt",
    (outcome, solved, burned, view) => {
      expect(
        taskDraftFromPracticeWorkspace(
          snapshot({ attempts: [attempt(outcome, ["answer"], 3)] }),
          2,
        ),
      ).toMatchObject({ solved, burned, view, hintsShown: 2, dirty: false });
    },
  );
});

function snapshot(
  overrides: Partial<PracticeWorkspaceSnapshot> = {},
): PracticeWorkspaceSnapshot {
  return {
    startedAt,
    latestSubmittedAt: startedAt,
    currentIndex: 0,
    activeDurationMs: 0,
    attempts: [],
    draft: null,
    ...overrides,
  };
}

function attempt(
  outcome: "correct" | "incorrect" | "skipped",
  answers: string[],
  helpLevel: number,
) {
  return {
    id: "6fb1f40b-707b-5abf-9b76-770dc0c0c217",
    number: 1,
    startedAt,
    submittedAt: startedAt + 1_000,
    activeDurationMs: 1_000,
    answers,
    outcome,
    helpLevel,
  };
}
