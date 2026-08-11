import { describe, expect, it } from "vitest";
import {
  selectTaskAttemptContent,
  type TaskAttemptContent,
} from "./task-history-content";

const current = content("sha256:current", "current");
const archived = content("sha256:archived", "archived");

describe("task attempt content selection", () => {
  it("uses an archived candidate only when the attempt revision matches", () => {
    expect(
      selectTaskAttemptContent(archived.revision, current, archived),
    ).toEqual({
      content: archived,
      isArchived: true,
      revisionMismatch: false,
    });
  });

  it("rejects a different archived candidate for the same task", () => {
    expect(
      selectTaskAttemptContent("sha256:another", current, archived),
    ).toEqual({
      content: current,
      isArchived: false,
      revisionMismatch: true,
    });
  });

  it("keeps the current warning when an old revision cannot be resolved", () => {
    expect(selectTaskAttemptContent("sha256:missing", current, null)).toEqual({
      content: current,
      isArchived: false,
      revisionMismatch: true,
    });
  });

  it("uses current content when the attempt revision is current", () => {
    expect(
      selectTaskAttemptContent(current.revision, current, archived),
    ).toEqual({
      content: current,
      isArchived: false,
      revisionMismatch: false,
    });
  });

  it("keeps legacy entries without revisions on current content", () => {
    expect(selectTaskAttemptContent(undefined, current, archived)).toEqual({
      content: current,
      isArchived: false,
      revisionMismatch: false,
    });
  });
});

function content(revision: string, marker: string): TaskAttemptContent {
  return {
    revision,
    slot: 1,
    topicName: marker,
    statementHtml: marker,
    correctAnswerHtml: marker,
    hintsHtml: [marker],
    solutionHtml: marker,
    fieldLabels: [marker],
  };
}
