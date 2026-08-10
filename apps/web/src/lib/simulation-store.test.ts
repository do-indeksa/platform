import { describe, expect, it } from "vitest";
import {
  EXAM_DURATION_MS,
  migrateSimulationState,
  type SimulationTask,
} from "./simulation-store";

const oldDeadline = Date.UTC(2026, 6, 12, 12);

function legacyTask(): Omit<SimulationTask, "examPosition" | "maxPoints"> {
  return {
    id: "kb-001",
    slot: 1,
    topicName: "Kompleksni brojevi",
    statementHtml: "<p>Zadatak</p>",
    solutionHtml: "<p>Rešenje</p>",
    answer: "1",
  };
}

function legacyState(overrides: Record<string, unknown> = {}) {
  return {
    kind: "simulation",
    tasks: [legacyTask()],
    marks: [null],
    phase: "running",
    endsAt: oldDeadline,
    currentIndex: 0,
    history: [],
    ...overrides,
  };
}

describe("simulation persistence migration", () => {
  it("uses the current four-hour P1 duration", () => {
    expect(EXAM_DURATION_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("extends an active legacy simulation and supplies task point values", () => {
    const migrated = migrateSimulationState(legacyState(), 2);

    expect(migrated.endsAt).toBe(oldDeadline + 60 * 60 * 1000);
    expect(migrated.tasks[0]).toEqual({
      ...legacyTask(),
      examPosition: 1,
      maxPoints: 6,
    });
  });

  it("migrates a version-one simulation without persisted run metadata", () => {
    const withoutKind: Record<string, unknown> = legacyState();
    delete withoutKind.kind;
    const migrated = migrateSimulationState(withoutKind, 1);

    expect(migrated.endsAt).toBe(oldDeadline + 60 * 60 * 1000);
  });

  it.each([
    { label: "grading phase", overrides: { phase: "grading" } },
    { label: "completed phase", overrides: { phase: "done" } },
  ])("does not extend a legacy $label deadline", ({ overrides }) => {
    const migrated = migrateSimulationState(legacyState(overrides), 2);
    expect(migrated.endsAt).toBe(oldDeadline);
  });

  it("removes a legacy diagnostic from the simulation store", () => {
    const history = [
      { finishedAt: oldDeadline, score: 42, taskIds: ["kb-001"] },
    ];
    expect(
      migrateSimulationState(legacyState({ kind: "diagnostic", history }), 3),
    ).toEqual({
      tasks: [],
      marks: [],
      phase: null,
      endsAt: null,
      currentIndex: 0,
      history,
    });
  });

  it("resets version-zero active data while preserving history", () => {
    const history = [
      { finishedAt: oldDeadline, score: 42, taskIds: ["kb-001"] },
    ];

    expect(migrateSimulationState({ history }, 0)).toEqual({
      tasks: [],
      marks: [],
      phase: null,
      endsAt: null,
      currentIndex: 0,
      history,
    });
  });
});
