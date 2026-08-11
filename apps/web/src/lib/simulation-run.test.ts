import { describe, expect, it } from "vitest";
import {
  parseSimulationRunQuery,
  parseSimulationTaskRevisions,
  simulationResultHref,
  simulationRunHref,
} from "./simulation-run";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const taskIds = ["kb-001", "kv-001", "eks-001"];
const taskRevisions = ["a", "b", "c"].map(
  (value) => `sha256:${value.repeat(64)}`,
);

describe("simulation run URL", () => {
  it("round-trips a canonical versioned run", () => {
    const href = simulationRunHref("/simulation/new", {
      runId,
      blueprintVersion: "2026.1",
      taskIds,
    });
    const query = Object.fromEntries(
      new URL(href, "https://example.test").searchParams,
    );

    expect(parseSimulationRunQuery(query, 3)).toEqual({
      runId,
      blueprintVersion: "2026.1",
      taskIds,
    });
  });

  it.each([
    { run: "bad", version: "2026.1", set: taskIds.join(",") },
    { run: runId, version: "latest", set: taskIds.join(",") },
    { run: runId, version: "2026.1", set: "kb-001,kv-001" },
    { run: runId, version: "2026.1", set: "kb-001,kb-001,eks-001" },
    { run: runId, version: "2026.1", set: "kb-001,../bad,eks-001" },
  ])("rejects malformed query %#", (query) => {
    expect(parseSimulationRunQuery(query, 3)).toBeNull();
  });

  it("round-trips a bounded revision list only on result links", () => {
    const href = simulationResultHref(
      { runId, blueprintVersion: "2026.1", taskIds },
      taskRevisions,
    );
    const revisions = new URL(href, "https://example.test").searchParams.get(
      "revisions",
    );

    expect(parseSimulationTaskRevisions(revisions ?? undefined, 3)).toEqual(
      taskRevisions,
    );
    expect(
      simulationRunHref("/simulation/new", {
        runId,
        blueprintVersion: "2026.1",
        taskIds,
      }),
    ).not.toContain("revisions=");
  });

  it("rejects malformed or misaligned result revisions", () => {
    expect(parseSimulationTaskRevisions(undefined, 3)).toBeNull();
    expect(
      parseSimulationTaskRevisions(taskRevisions.slice(0, 2).join(","), 3),
    ).toBeNull();
    expect(
      parseSimulationTaskRevisions(
        [...taskRevisions.slice(0, 2), "../tasks"].join(","),
        3,
      ),
    ).toBeNull();
    expect(() =>
      simulationResultHref(
        { runId, blueprintVersion: "2026.1", taskIds },
        taskRevisions.slice(0, 2),
      ),
    ).toThrow("revisions must match");
  });
});
