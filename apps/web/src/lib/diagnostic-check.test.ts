import { describe, expect, it } from "vitest";
import {
  checkDiagnosticAnswers,
  parseDiagnosticCheckRequest,
} from "./diagnostic-check";

describe("diagnostic answer checks", () => {
  it("accepts a bounded same-origin payload", () => {
    expect(
      parseDiagnosticCheckRequest({
        taskId: "kb-001",
        topic: "kompleksni-brojevi",
        answers: ["1", "3sqrt(2)"],
      }),
    ).toEqual({
      taskId: "kb-001",
      topic: "kompleksni-brojevi",
      answers: ["1", "3sqrt(2)"],
    });
  });

  it.each([
    null,
    { taskId: "../kb-001", topic: "kompleksni-brojevi", answers: ["1"] },
    { taskId: "kb-001", topic: "../content", answers: ["1"] },
    { taskId: "kb-001", topic: "kompleksni-brojevi", answers: [] },
    {
      taskId: "kb-001",
      topic: "kompleksni-brojevi",
      answers: ["1", "2", "3", "4", "5", "6", "7"],
    },
    {
      taskId: "kb-001",
      topic: "kompleksni-brojevi",
      answers: ["x".repeat(201)],
    },
  ])("rejects a malformed payload", (payload) => {
    expect(parseDiagnosticCheckRequest(payload)).toBeNull();
  });

  it("collapses multipart checks into a silent task outcome", () => {
    const parts = [
      { label: "t", kind: "value" as const, expected: "1" },
      { label: "|z|", kind: "value" as const, expected: "3sqrt(2)" },
    ];

    expect(checkDiagnosticAnswers(parts, ["1", "3sqrt(2)"])).toBe("correct");
    expect(checkDiagnosticAnswers(parts, ["1", "4"])).toBe("incorrect");
    expect(checkDiagnosticAnswers(parts, ["", "3sqrt(2)"])).toBe("invalid");
    expect(checkDiagnosticAnswers(parts, ["1"])).toBe("invalid");
  });
});
