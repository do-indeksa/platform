import { describe, expect, it } from "vitest";
import { diagnosticPracticeSet } from "./diagnostic-result";

describe("diagnostic practice recommendation", () => {
  it("prioritizes measured gaps, then skipped and confident positions", () => {
    const tasks = ["kb", "kv", "eks", "log"].map((id) => ({
      practiceTask: { id: `${id}-002`, topic: id },
    }));

    expect(
      diagnosticPracticeSet(
        tasks,
        ["correct", "incorrect", "skipped", "incorrect"],
        3,
      ),
    ).toEqual([
      { id: "kv-002", topic: "kv" },
      { id: "log-002", topic: "log" },
      { id: "eks-002", topic: "eks" },
    ]);
  });

  it("omits missing and duplicate alternatives", () => {
    const duplicate = { id: "kb-002", topic: "kb" };
    expect(
      diagnosticPracticeSet(
        [
          { practiceTask: null },
          { practiceTask: duplicate },
          { practiceTask: duplicate },
        ],
        ["incorrect", "skipped", "correct"],
      ),
    ).toEqual([duplicate]);
  });
});
