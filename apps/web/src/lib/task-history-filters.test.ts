import { describe, expect, it } from "vitest";
import type { HistoryAttempt } from "./history-journal";
import {
  defaultTaskHistoryFilters,
  filterTaskHistory,
  hasActiveTaskHistoryFilters,
  parseTaskHistoryFilters,
  safeTaskHistoryReturnPath,
  serializeTaskHistoryFilters,
  taskHistoryHref,
} from "./task-history-filters";

const now = Date.parse("2026-08-11T12:00:00.000Z");
const tasks = new Map([
  ["new-error", { topic: "complex" }],
  ["new-correct", { topic: "quadratic" }],
  ["old-error", { topic: "complex" }],
  ["future-error", { topic: "complex" }],
]);
const entries = [
  historyAttempt("new-error", "incorrect", "2026-08-11T10:00:00.000Z"),
  historyAttempt("new-correct", "correct", "2026-08-10T12:00:00.000Z"),
  historyAttempt("old-error", "incorrect", "2026-07-01T12:00:00.000Z"),
  historyAttempt("future-error", "incorrect", "2026-08-12T12:00:00.000Z"),
];

describe("task history filters", () => {
  it("parses only allowlisted values and valid topics", () => {
    expect(
      parseTaskHistoryFilters(
        {
          topic: ["complex", "quadratic"],
          outcome: "incorrect",
          period: "30d",
        },
        new Set(["complex", "quadratic"]),
      ),
    ).toEqual({ topic: "complex", outcome: "incorrect", period: "30d" });

    expect(
      parseTaskHistoryFilters(
        { topic: "private", outcome: "wrong", period: "forever" },
        new Set(["complex"]),
      ),
    ).toEqual(defaultTaskHistoryFilters);
  });

  it("serializes a canonical query and omits defaults", () => {
    expect(
      serializeTaskHistoryFilters(defaultTaskHistoryFilters).toString(),
    ).toBe("");
    const filters = {
      topic: "complex",
      outcome: "incorrect",
      period: "7d",
    } as const;
    expect(serializeTaskHistoryFilters(filters).toString()).toBe(
      "topic=complex&outcome=incorrect&period=7d",
    );
    expect(taskHistoryHref(filters)).toBe(
      "/history?topic=complex&outcome=incorrect&period=7d",
    );
  });

  it("combines topic, outcome, and rolling-period filters without reordering", () => {
    expect(
      filterTaskHistory(
        entries,
        tasks,
        { topic: "complex", outcome: "incorrect", period: "7d" },
        now,
      ).map((entry) => entry.taskId),
    ).toEqual(["new-error"]);
  });

  it("includes the period boundary and excludes future timestamps", () => {
    const boundary = historyAttempt(
      "new-error",
      "incorrect",
      "2026-08-04T12:00:00.000Z",
    );
    expect(
      filterTaskHistory(
        [boundary, ...entries],
        tasks,
        { ...defaultTaskHistoryFilters, period: "7d" },
        now,
      ).map((entry) => entry.id),
    ).toEqual([boundary.id, entries[0].id, entries[1].id]);
  });

  it("reports whether presentation filters are active", () => {
    expect(hasActiveTaskHistoryFilters(defaultTaskHistoryFilters)).toBe(false);
    expect(
      hasActiveTaskHistoryFilters({
        ...defaultTaskHistoryFilters,
        outcome: "partial",
      }),
    ).toBe(true);
  });

  it("normalizes only safe same-origin history return paths", () => {
    const validTopics = new Set(["complex"]);
    expect(
      safeTaskHistoryReturnPath(
        "/history?period=7d&outcome=incorrect&topic=complex",
        validTopics,
      ),
    ).toBe("/history?topic=complex&outcome=incorrect&period=7d");
    expect(safeTaskHistoryReturnPath("/history", validTopics)).toBe("/history");
    expect(
      safeTaskHistoryReturnPath("https://example.com/history", validTopics),
    ).toBeNull();
    expect(
      safeTaskHistoryReturnPath("/history?topic=private", validTopics),
    ).toBeNull();
    expect(
      safeTaskHistoryReturnPath(
        "/history?outcome=incorrect&outcome=correct",
        validTopics,
      ),
    ).toBeNull();
    expect(
      safeTaskHistoryReturnPath("/history?redirect=/private", validTopics),
    ).toBeNull();
  });
});

function historyAttempt(
  taskId: string,
  outcome: HistoryAttempt["outcome"],
  at: string,
): HistoryAttempt {
  return {
    id: `${taskId}-${at}`,
    taskId,
    slot: 1,
    source: "practice",
    outcome,
    answers: ["1"],
    helpLevel: 0,
    at,
  };
}
