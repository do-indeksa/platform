import { describe, expect, it } from "vitest";
import {
  alignSimulationResultAnswers,
  selectSimulationResultContent,
  type SimulationResultContentCandidate,
} from "./simulation-result-content";
import type {
  SimulationHistoryEntry,
  SimulationTaskView,
} from "./simulation-types";

const current = [task("task-1", "current-1"), task("task-2", "current-2")];
const archived = task("task-1", "archived-1");

describe("simulation result content selection", () => {
  it("aligns stored answers to the selected task fields", () => {
    expect(
      alignSimulationResultAnswers(
        [
          { fields: [{ kind: "value" }] },
          {
            fields: [{ kind: "value" }, { kind: "value" }, { kind: "value" }],
          },
        ],
        [
          ["kept", "discarded"],
          ["first", "second"],
        ],
      ),
    ).toEqual([["kept"], ["first", "second", ""]]);
  });

  it("accepts a complete candidate matching the hydrated run snapshot", () => {
    expect(
      selectSimulationResultContent(
        entry("set-archived", [archived.revision, current[1].revision]),
        "set-current",
        current,
        candidate("set-archived", [archived, null]),
      ),
    ).toEqual({
      tasks: [archived, current[1]],
      isArchived: true,
      revisionMismatch: false,
    });
  });

  it("rejects the whole candidate when one archived task is missing", () => {
    expect(
      selectSimulationResultContent(
        entry("set-archived", [archived.revision, current[1].revision]),
        "set-current",
        current,
        candidate("set-current", [null, null]),
      ),
    ).toEqual({
      tasks: current,
      isArchived: false,
      revisionMismatch: true,
    });
  });

  it("rejects matching task revisions under a different set revision", () => {
    expect(
      selectSimulationResultContent(
        entry("set-archived", [archived.revision, current[1].revision]),
        "set-current",
        current,
        candidate("set-tampered", [archived, null]),
      ).revisionMismatch,
    ).toBe(true);
  });

  it("does not let an archive candidate relabel a current run", () => {
    expect(
      selectSimulationResultContent(
        entry(
          "set-current",
          current.map(({ revision }) => revision),
        ),
        "set-current",
        current,
        candidate("set-archived", [archived, null]),
      ),
    ).toEqual({
      tasks: current,
      isArchived: false,
      revisionMismatch: false,
    });
  });

  it("keeps a matching current snapshot on current content", () => {
    expect(
      selectSimulationResultContent(
        entry(
          "set-current",
          current.map(({ revision }) => revision),
        ),
        "set-current",
        current,
        null,
      ),
    ).toEqual({
      tasks: current,
      isArchived: false,
      revisionMismatch: false,
    });
  });

  it("keeps legacy runs without revision metadata on current content", () => {
    expect(
      selectSimulationResultContent(
        { taskIds: current.map(({ id }) => id) },
        "set-current",
        current,
        candidate("set-archived", [archived, null]),
      ),
    ).toEqual({
      tasks: current,
      isArchived: false,
      revisionMismatch: false,
    });
  });
});

function entry(
  contentRevision: string,
  taskRevisions: string[],
): Pick<SimulationHistoryEntry, "taskIds" | "archiveSnapshot" | "progress"> {
  return {
    taskIds: current.map(({ id }) => id),
    archiveSnapshot: { contentRevision, taskRevisions },
  };
}

function candidate(
  contentRevision: string,
  tasks: (SimulationTaskView | null)[],
): SimulationResultContentCandidate {
  return { contentRevision, tasks };
}

function task(id: string, revision: string): SimulationTaskView {
  return {
    id,
    revision,
    slot: 1,
    examPosition: 1,
    maxPoints: 6,
    topic: "topic",
    topicName: revision,
    statementHtml: revision,
    fields: [{ kind: "value" }],
  };
}
