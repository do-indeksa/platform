import { describe, expect, it } from "vitest";
import {
  gradeSimulationAnswers,
  parseSimulationGradeRequest,
} from "./simulation-grade";

const tasks = [
  {
    id: "kb-001",
    maxPoints: 6,
    check: [{ kind: "value" as const, expected: "2" }],
  },
  {
    id: "ster-001",
    maxPoints: 6,
    check: [
      { label: "a)", kind: "value" as const, expected: "6" },
      { label: "b)", kind: "value" as const, expected: "2sqrt(3)" },
    ],
  },
];

describe("simulation grading", () => {
  it("keeps unanswered tasks distinct and grades all parts", () => {
    expect(gradeSimulationAnswers(tasks, [["2"], ["6", "wrong"]])).toEqual([
      {
        taskId: "kb-001",
        outcome: "correct",
        earnedPoints: 6,
        maxPoints: 6,
      },
      {
        taskId: "ster-001",
        outcome: "incorrect",
        earnedPoints: 0,
        maxPoints: 6,
      },
    ]);
    expect(gradeSimulationAnswers(tasks, [[""], ["", ""]])?.[0]).toMatchObject({
      outcome: "unanswered",
      earnedPoints: 0,
    });
  });

  it("rejects mismatched field composition", () => {
    expect(gradeSimulationAnswers(tasks, [["2"], ["6"]])).toBeNull();
  });

  it("parses only bounded, unique, versioned requests", () => {
    const taskRevisions = ["a", "b"].map(
      (value) => `sha256:${value.repeat(64)}`,
    );
    const valid = {
      blueprintVersion: "2026.1",
      taskIds: ["kb-001", "ster-001"],
      taskRevisions,
      answers: [["2"], ["6", "2sqrt(3)"]],
    };
    expect(parseSimulationGradeRequest(valid)).toEqual(valid);
    expect(
      parseSimulationGradeRequest({
        ...valid,
        taskIds: ["kb-001", "kb-001"],
      }),
    ).toBeNull();
    expect(
      parseSimulationGradeRequest({ ...valid, answers: [["2"]] }),
    ).toBeNull();
    expect(
      parseSimulationGradeRequest({
        ...valid,
        taskRevisions: taskRevisions.slice(0, 1),
      }),
    ).toBeNull();
    expect(
      parseSimulationGradeRequest({
        ...valid,
        taskRevisions: [taskRevisions[0], "../tasks"],
      }),
    ).toBeNull();
    expect(
      parseSimulationGradeRequest({
        blueprintVersion: "2026.1",
        taskIds: ["kv-003"],
        answers: [["1", "2", "3", "4", "5", "6"]],
      }),
    ).not.toBeNull();
    expect(
      parseSimulationGradeRequest({
        blueprintVersion: "2026.1",
        taskIds: ["kv-003"],
        answers: [["1", "2", "3", "4", "5", "6", "7"]],
      }),
    ).toBeNull();
  });
});
