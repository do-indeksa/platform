import { describe, expect, it } from "vitest";
import { diagnosticRunHref, parseDiagnosticRunQuery } from "./diagnostic-run";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const taskIds = ["kb-001", "kv-001", "log-001"];

describe("diagnostic run URLs", () => {
  it("round-trips a canonical local result URL", () => {
    const href = diagnosticRunHref("/diagnostic/result", runId, taskIds);
    const query = Object.fromEntries(
      new URL(href, "https://local").searchParams,
    );

    expect(parseDiagnosticRunQuery(query, 3)).toEqual({ runId, taskIds });
    expect(href).toBe(
      "/diagnostic/result?run=5ff78318-3436-4b4e-99b8-77ef34366ad3&set=kb-001%2Ckv-001%2Clog-001",
    );
  });

  it.each([
    { run: "not-a-uuid", set: taskIds.join(",") },
    { run: runId, set: "kb-001,kv-001" },
    { run: runId, set: "kb-001,kb-001,log-001" },
    { run: runId, set: "kb-001,../bad,log-001" },
    { run: [runId, crypto.randomUUID()], set: taskIds.join(",") },
  ])("rejects malformed run state", (query) => {
    expect(parseDiagnosticRunQuery(query, 3)).toBeNull();
  });
});
