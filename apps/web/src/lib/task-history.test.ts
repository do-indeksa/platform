import { describe, expect, it } from "vitest";
import {
  parseTaskHistory,
  recentErrorTaskIds,
  TASK_HISTORY_LIMIT,
  type TaskHistoryEntry,
  type StoredTaskHistoryEntry,
} from "./task-history";

function entry(
  sequence: number,
  overrides: Partial<TaskHistoryEntry> = {},
): TaskHistoryEntry {
  return {
    id: `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`,
    taskId: `task-${sequence}`,
    slot: 1,
    source: "practice",
    outcome: "incorrect",
    answers: ["1"],
    helpLevel: 0,
    at: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("task history", () => {
  it("migrates valid v1 entries to unclaimed v2 rows", () => {
    const valid = entry(1);
    const parsed = parseTaskHistory({
      version: 1,
      entries: [
        { ...valid, unknown: "drop-me" },
        { ...entry(2), taskId: "../secret" },
        { ...entry(3), answers: Array(7).fill("1") },
        { ...entry(4), helpLevel: 4 },
        { ...entry(5), at: "not-a-date" },
      ],
    });

    expect(parsed).toEqual([{ ...valid, ownerId: null }]);
    expect(parsed[0]).not.toBe(valid);
    expect(parsed[0].answers).not.toBe(valid.answers);
  });

  it("deduplicates IDs and caps persisted input", () => {
    const entries = Array.from({ length: TASK_HISTORY_LIMIT + 5 }, (_, index) =>
      entry(index + 1),
    );
    entries.splice(2, 0, { ...entries[0] });

    const parsed = parseTaskHistory({ version: 1, entries });

    expect(parsed).toHaveLength(TASK_HISTORY_LIMIT);
    expect(new Set(parsed.map(({ id }) => id))).toHaveLength(
      TASK_HISTORY_LIMIT,
    );
  });

  it("accepts only valid v2 owners", () => {
    const valid: StoredTaskHistoryEntry = {
      ...entry(1),
      ownerId: "a0209703-275b-4c6e-b815-25025b923ae8",
    };

    expect(
      parseTaskHistory({
        version: 2,
        entries: [valid, { ...entry(2), ownerId: "not-a-user" }],
      }),
    ).toEqual([valid]);
  });

  it("returns recent unique mistakes in journal order", () => {
    const entries = [
      entry(1, { taskId: "kb-001" }),
      entry(2, { taskId: "kb-001" }),
      entry(3, { taskId: "kv-001", outcome: "correct" }),
      entry(4, { taskId: "log-001" }),
      entry(5, { taskId: "trig-001" }),
    ];

    expect(recentErrorTaskIds(entries, 2)).toEqual(["kb-001", "log-001"]);
    expect(recentErrorTaskIds(entries, 0)).toEqual([]);
  });

  it("rejects unknown or future storage versions", () => {
    expect(parseTaskHistory(null)).toEqual([]);
    expect(parseTaskHistory({ version: 3, entries: [entry(1)] })).toEqual([]);
  });
});
