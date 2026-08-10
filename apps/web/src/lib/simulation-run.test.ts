import { describe, expect, it } from "vitest";
import { parseSimulationRunQuery, simulationRunHref } from "./simulation-run";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const taskIds = ["kb-001", "kv-001", "eks-001"];

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
});
