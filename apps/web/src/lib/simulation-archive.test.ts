import { describe, expect, it } from "vitest";
import {
  compatibleSimulationHistory,
  mergeSimulationArchive,
  simulationContentChanged,
  type SimulationArchiveRun,
} from "./simulation-archive";
import type { SimulationHistoryEntry } from "./simulation-types";

const REVISION_A = `sha256:${"a".repeat(64)}`;
const REVISION_B = `sha256:${"b".repeat(64)}`;

function history(
  id: string,
  finishedAt: number,
  score: number,
): SimulationHistoryEntry {
  return {
    id,
    blueprintVersion: "2026.1",
    startedAt: finishedAt - 1_000,
    finishedAt,
    durationMs: 1_000,
    timedOut: false,
    score,
    maxPoints: 6,
    correctCount: score === 6 ? 1 : 0,
    answeredCount: 1,
    taskIds: ["task-1"],
    answers: [["1"]],
    results: [
      {
        taskId: "task-1",
        outcome: score === 6 ? "correct" : "incorrect",
        earnedPoints: score,
        maxPoints: 6,
      },
    ],
  };
}

function remote(entry: SimulationHistoryEntry): SimulationArchiveRun {
  return {
    id: entry.id,
    blueprintVersion: entry.blueprintVersion,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
    timedOut: entry.timedOut,
    score: entry.score,
    maxPoints: entry.maxPoints,
    correctCount: entry.correctCount,
    answeredCount: entry.answeredCount,
    taskIds: [...entry.taskIds],
    outcomes: entry.results.map(({ outcome }) => outcome),
    historyEntry: entry,
  };
}

describe("simulation archive merge", () => {
  it("prefers the richer local UUID and sorts the combined archive", () => {
    const sharedId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
    const remoteOnlyId = "8d04f81d-4435-4f7f-b314-2fe16334f0cf";
    const local = history(sharedId, 20, 6);
    local.progress = {
      contentRevision: REVISION_A,
      items: [
        {
          taskId: "task-1",
          taskRevision: REVISION_A,
          slot: 1,
          examPosition: 1,
          topic: "topic-1",
          maxPoints: 6,
        },
      ],
    };
    const sharedRemote = remote(history(sharedId, 20, 6));
    if (sharedRemote.historyEntry) {
      sharedRemote.historyEntry.archiveSnapshot = {
        contentRevision: REVISION_A,
        taskRevisions: [REVISION_A],
      };
    }
    const merged = mergeSimulationArchive(
      [local],
      [sharedRemote, remote(history(remoteOnlyId, 30, 0))],
    );

    expect(merged.map(({ id }) => id)).toEqual([remoteOnlyId, sharedId]);
    expect(merged[1].score).toBe(6);
    expect(merged[1].historyEntry?.progress).toBeDefined();
    expect(compatibleSimulationHistory(merged)).toHaveLength(2);
  });

  it("keeps server grading authoritative when a local UUID disagrees", () => {
    const sharedId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
    const merged = mergeSimulationArchive(
      [history(sharedId, 20, 6)],
      [remote(history(sharedId, 20, 0))],
    );

    expect(merged[0].score).toBe(0);
    expect(merged[0].historyEntry?.results[0].outcome).toBe("incorrect");
  });

  it("detects both set-level and task-level content changes", () => {
    const entry = history("5ff78318-3436-4b4e-99b8-77ef34366ad3", 20, 6);
    entry.archiveSnapshot = {
      contentRevision: REVISION_A,
      taskRevisions: [REVISION_A],
    };

    expect(
      simulationContentChanged(entry, REVISION_A, [{ revision: REVISION_A }]),
    ).toBe(false);
    expect(
      simulationContentChanged(entry, REVISION_B, [{ revision: REVISION_A }]),
    ).toBe(true);
    expect(
      simulationContentChanged(entry, REVISION_A, [{ revision: REVISION_B }]),
    ).toBe(true);
  });
});
