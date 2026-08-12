import { describe, expect, it } from "vitest";
import { taskDraftStorageKey } from "../../lib/task-draft";
import {
  formatElapsedTime,
  parseTaskWorkspaceStatus,
  resolvePracticeStartedAt,
} from "./task-session";

describe("task workspace session", () => {
  it("keeps draft keys scoped to a selected practice", () => {
    expect(taskDraftStorageKey("kb-001", null)).toBe(
      "do-indeksa-task-draft-v1:kb-001",
    );
    expect(taskDraftStorageKey("kb-001", "practice-id")).toBe(
      "do-indeksa-task-draft-v1:practice-id:kb-001",
    );
  });

  it("derives honest rail states from a persisted draft", () => {
    const draft = {
      answers: [""],
      view: "form",
      attempted: true,
      hintsShown: 0,
      solved: false,
      burned: false,
      dirty: false,
    };
    expect(parseTaskWorkspaceStatus(null, 1, 2)).toBe("pending");
    expect(parseTaskWorkspaceStatus("not-json", 1, 2)).toBe("pending");
    expect(parseTaskWorkspaceStatus(JSON.stringify(draft), 1, 2)).toBe("retry");
    expect(
      parseTaskWorkspaceStatus(
        JSON.stringify({ ...draft, view: "correct", solved: true }),
        1,
        2,
      ),
    ).toBe("solved");
    expect(
      parseTaskWorkspaceStatus(
        JSON.stringify({ ...draft, view: "solution", burned: true }),
        1,
        2,
      ),
    ).toBe("skipped");
    expect(parseTaskWorkspaceStatus(JSON.stringify(draft), 4, 2)).toBe(
      "pending",
    );
  });

  it("rejects stale clocks and formats elapsed time", () => {
    const now = 100_000_000;
    expect(resolvePracticeStartedAt(String(now - 65_000), now)).toBe(
      now - 65_000,
    );
    expect(resolvePracticeStartedAt(String(now + 1), now)).toBe(now);
    expect(resolvePracticeStartedAt("invalid", now)).toBe(now);
    expect(
      resolvePracticeStartedAt(String(now - 13 * 60 * 60 * 1_000), now),
    ).toBe(now);
    expect(formatElapsedTime(65)).toBe("01:05");
    expect(formatElapsedTime(3_661)).toBe("1:01:01");
  });
});
