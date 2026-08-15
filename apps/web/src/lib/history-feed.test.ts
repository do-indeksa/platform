import { describe, expect, it } from "vitest";
import {
  buildHistoryFeed,
  filterHistoryFeed,
  historyHref,
  parseHistoryFeedFilters,
  parseHistoryTab,
  type HistoryTaskMeta,
} from "./history-feed";
import type { HistoryAttempt } from "./history-journal";
import type { HistoryRunSummary } from "./history-run-summary";
import type { SimulationArchiveRun } from "./simulation-archive";

const tasks: HistoryTaskMeta[] = [
  {
    id: "kb-001",
    slot: 1,
    topic: "kompleksni-brojevi",
    topicName: "Kompleksni brojevi",
    difficulty: 1,
  },
  {
    id: "kv-001",
    slot: 2,
    topic: "kvadratne-jednacine",
    topicName: "Kvadratne jednačine",
    difficulty: 5,
  },
];

const attempt: HistoryAttempt = {
  id: "11111111-1111-4111-8111-111111111111",
  taskId: "kb-001",
  slot: 1,
  source: "practice",
  outcome: "incorrect",
  answers: ["0"],
  helpLevel: 0,
  at: "2026-08-10T10:00:00.000Z",
};

const run: HistoryRunSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "PRACTICE",
  status: "SUBMITTED",
  blueprintVersion: "practice-v1",
  contentRevision: "content-v1",
  startedAt: "2026-08-10T10:01:00.000Z",
  submittedAt: "2026-08-10T10:20:00.000Z",
  taskIds: ["kb-001", "kv-001"],
  itemCount: 2,
  completedItemCount: 2,
  correctItemCount: 1,
};

const mock: SimulationArchiveRun = {
  id: "33333333-3333-4333-8333-333333333333",
  blueprintVersion: "ftn-p1:2026.1",
  startedAt: Date.parse("2026-08-10T11:00:00.000Z"),
  finishedAt: Date.parse("2026-08-10T12:00:00.000Z"),
  durationMs: 3_600_000,
  timedOut: false,
  score: 42,
  maxPoints: 60,
  correctCount: 7,
  answeredCount: 10,
  taskIds: ["kb-001", "kv-001"],
  outcomes: ["correct", "incorrect"],
  historyEntry: null,
};

describe("history feed", () => {
  it("builds and sorts truthful task, run, and mock items", () => {
    expect(
      buildHistoryFeed({
        attempts: [attempt],
        runs: [run],
        mocks: [mock],
        tasks,
      }).map(({ kind, id }) => [kind, id]),
    ).toEqual([
      ["mock", mock.id],
      ["training", run.id],
      ["task", attempt.id],
    ]);
  });

  it("does not expose active, abandoned, simulation, or unknown-task rows", () => {
    const entries = buildHistoryFeed({
      attempts: [{ ...attempt, taskId: "missing-001" }],
      runs: [
        {
          ...run,
          id: "44444444-4444-4444-8444-444444444444",
          status: "ACTIVE",
          submittedAt: undefined,
        },
        {
          ...run,
          id: "55555555-5555-4555-8555-555555555555",
          kind: "SIMULATION",
        },
      ],
      mocks: [],
      tasks,
    });
    expect(entries).toEqual([]);
  });

  it("filters tabs, periods, and aggregate difficulty by real tasks", () => {
    const items = buildHistoryFeed({
      attempts: [attempt],
      runs: [run],
      mocks: [mock],
      tasks,
    });
    const now = Date.parse("2026-08-11T10:00:00.000Z");
    expect(
      filterHistoryFeed(
        items,
        "trainings",
        { subject: "p1", period: "7d", difficulty: "hard" },
        tasks,
        now,
      ).map(({ id }) => id),
    ).toEqual([run.id]);
    expect(
      filterHistoryFeed(
        items,
        "tasks",
        { subject: "all", period: "7d", difficulty: "hard" },
        tasks,
        now,
      ),
    ).toEqual([]);
  });

  it("parses bounded shareable query state and the variants alias", () => {
    expect(parseHistoryTab("variants")).toBe("mocks");
    expect(parseHistoryTab("bad")).toBe("all");
    const filters = parseHistoryFeedFilters({
      subject: "p1",
      period: "30d",
      difficulty: "hard",
    });
    expect(filters).toEqual({
      subject: "p1",
      period: "30d",
      difficulty: "hard",
    });
    expect(historyHref("mocks", filters)).toBe(
      "/history?tab=mocks&subject=p1&period=30d&difficulty=hard",
    );
    expect(
      parseHistoryFeedFilters({ period: "forever", difficulty: "impossible" }),
    ).toEqual({
      subject: "all",
      period: "all",
      difficulty: "all",
    });
  });
});
