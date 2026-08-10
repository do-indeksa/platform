import { describe, expect, it } from "vitest";
import {
  createTaskDraft,
  MAX_ANSWER_LENGTH,
  parseTaskDraft,
} from "./task-draft";

describe("task draft", () => {
  it("creates one empty answer per checked part", () => {
    expect(createTaskDraft(2)).toMatchObject({
      answers: ["", ""],
      view: "form",
      dirty: false,
    });
  });

  it("restores a valid solved draft", () => {
    const draft = {
      ...createTaskDraft(1),
      answers: ["sqrt(2)"],
      attempted: true,
      solved: true,
      view: "solution" as const,
    };

    expect(parseTaskDraft(JSON.stringify(draft), 1, 2)).toEqual(draft);
  });

  it.each([
    null,
    "not-json",
    JSON.stringify({}),
    JSON.stringify({ ...createTaskDraft(1), answers: [] }),
    JSON.stringify({ ...createTaskDraft(1), hintsShown: 3 }),
    JSON.stringify({ ...createTaskDraft(1), view: "correct" }),
    JSON.stringify({ ...createTaskDraft(1), solved: true, burned: true }),
    JSON.stringify({
      ...createTaskDraft(1),
      answers: ["x".repeat(MAX_ANSWER_LENGTH + 1)],
    }),
  ])("rejects an invalid persisted value", (raw) => {
    expect(parseTaskDraft(raw, 1, 2)).toBeNull();
  });
});
