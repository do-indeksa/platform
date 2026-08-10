import { describe, expect, it } from "vitest";
import type { TaskSummary } from "./content";
import type { Attempt } from "./knowledge";
import {
  defaultTaskBankFilters,
  filterTaskSummaries,
  parsePracticeSet,
  parsePracticeId,
  parseTaskBankState,
  safeTaskBankReturnPath,
  serializeTaskBankState,
  taskPracticeHref,
  taskProgress,
} from "./task-bank";

const tasks: TaskSummary[] = [
  {
    id: "kb-001",
    slot: 1,
    topic: "complex",
    difficulty: 2,
    source: "Do indeksa",
    statementPreview: "Find the modulus of z.",
    statementPreviewHtml: "<p>Find the modulus of z.</p>",
  },
  {
    id: "log-001",
    slot: 3,
    topic: "logs",
    difficulty: 3,
    source: "Do indeksa",
    statementPreview: "Solve a logarithmic equation.",
    statementPreviewHtml: "<p>Solve a logarithmic equation.</p>",
  },
  {
    id: "geo-001",
    slot: 7,
    topic: "geometry",
    difficulty: 4,
    source: "Do indeksa",
    statementPreview: "Find the triangle area.",
    statementPreviewHtml: "<p>Find the triangle area.</p>",
  },
];

const attempts: Attempt[] = [
  {
    taskId: "kb-001",
    slot: 1,
    correct: false,
    source: "practice",
    helpLevel: 0,
    at: "2026-08-10T10:00:00.000Z",
  },
  {
    taskId: "kb-001",
    slot: 1,
    correct: true,
    source: "practice",
    helpLevel: 1,
    at: "2026-08-10T10:05:00.000Z",
  },
];

const topicLabels = {
  complex: "Complex numbers",
  logs: "Logarithms",
  geometry: "Geometry",
};

const topicSlots = new Map([
  ["complex", 1],
  ["logs", 3],
  ["geometry", 7],
]);

describe("task bank query state", () => {
  it("parses only known, bounded values", () => {
    const params = new URLSearchParams(
      "q=modulus&position=3&position=99&topic=logs&topic=unknown&difficulty=exam&difficulty=nope&progress=correct&sort=difficulty&selected=kb-001&selected=bad",
    );
    const state = parseTaskBankState(
      params,
      topicSlots,
      new Set(tasks.map((task) => task.id)),
    );

    expect(state).toEqual({
      filters: {
        query: "modulus",
        positions: [3],
        topics: ["logs"],
        difficulties: ["exam"],
        progress: "correct",
        sort: "difficulty",
      },
      selectedTaskIds: ["kb-001"],
    });
  });

  it("round-trips canonical filter and selection state", () => {
    const filters = {
      ...defaultTaskBankFilters,
      query: "  triangle  ",
      positions: [7, 1],
      topics: ["geometry"],
      difficulties: ["advanced" as const],
      progress: "incorrect" as const,
    };
    const params = serializeTaskBankState(filters, ["geo-001"]);
    const parsed = parseTaskBankState(
      params,
      topicSlots,
      new Set(tasks.map((task) => task.id)),
    );

    expect(parsed.filters).toEqual({
      ...filters,
      query: "triangle",
      positions: [1, 7],
    });
    expect(parsed.selectedTaskIds).toEqual(["geo-001"]);
  });

  it("drops topics outside selected exam positions", () => {
    const state = parseTaskBankState(
      new URLSearchParams("position=1&topic=logs&topic=complex"),
      topicSlots,
      new Set(tasks.map((task) => task.id)),
    );

    expect(state.filters.topics).toEqual(["complex"]);
  });
});

describe("task bank filtering", () => {
  it("combines search, position, difficulty and progress filters", () => {
    const result = filterTaskSummaries(
      tasks,
      topicLabels,
      {
        ...defaultTaskBankFilters,
        query: "LOGARITHMS",
        positions: [3],
        difficulties: ["exam"],
        progress: "new",
      },
      attempts,
    );

    expect(result.map((task) => task.id)).toEqual(["log-001"]);
  });

  it("matches Latin topic labels without requiring diacritics", () => {
    const result = filterTaskSummaries(
      tasks,
      { ...topicLabels, complex: "Kvadratne jednačine" },
      { ...defaultTaskBankFilters, query: "jednacine" },
      [],
    );

    expect(result.map((task) => task.id)).toEqual(["kb-001"]);
  });

  it("uses the latest attempt for visible progress", () => {
    expect(taskProgress(attempts, "kb-001")).toBe("correct");
    expect(taskProgress(attempts, "geo-001")).toBe("new");
  });
});

describe("practice navigation input", () => {
  it("builds a local practice URL with return state", () => {
    expect(
      taskPracticeHref(tasks[0], "/tasks?position=1", ["kb-001", "log-001"]),
    ).toBe(
      "/tasks/complex/kb-001?returnTo=%2Ftasks%3Fposition%3D1&set=kb-001%2Clog-001",
    );
  });

  it("deduplicates and validates selected task ids", () => {
    expect(
      parsePracticeSet(
        "log-001,bad,log-001,kb-001",
        new Set(tasks.map((task) => task.id)),
      ),
    ).toEqual(["log-001", "kb-001"]);
  });

  it("accepts only local task-bank return paths", () => {
    expect(safeTaskBankReturnPath("/tasks?topic=logs")).toBe(
      "/tasks?topic=logs",
    );
    expect(safeTaskBankReturnPath("https://example.com/tasks")).toBeNull();
    expect(safeTaskBankReturnPath("//example.com/tasks")).toBeNull();
    expect(safeTaskBankReturnPath("/prep")).toBe("/prep");
    expect(safeTaskBankReturnPath("/prep?redirect=bad")).toBeNull();
    expect(safeTaskBankReturnPath("/history?tab=tasks")).toBe(
      "/history?tab=tasks",
    );
    expect(safeTaskBankReturnPath("/history?redirect=bad")).toBeNull();
  });

  it("keeps a valid isolated practice identifier", () => {
    const practiceId = "00000000-0000-4000-8000-000000000001";
    expect(parsePracticeId(practiceId)).toBe(practiceId);
    expect(parsePracticeId("not-a-uuid")).toBeNull();
    expect(
      taskPracticeHref(tasks[0], "/history?tab=tasks", [], practiceId),
    ).toContain(`practice=${practiceId}`);
  });
});
