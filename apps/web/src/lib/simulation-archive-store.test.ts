import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulationArchiveRun } from "./simulation-archive";

const fetchArchive = vi.hoisted(() => vi.fn());
vi.mock("./simulation-archive-client", () => ({
  fetchSimulationArchive: fetchArchive,
}));

const USER_A = "a0209703-275b-4c6e-b815-25025b923ae8";
const USER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

function entry(id: string): SimulationArchiveRun {
  return {
    id,
    blueprintVersion: "2026.1",
    startedAt: 1,
    finishedAt: 2,
    durationMs: 1,
    timedOut: false,
    score: 0,
    maxPoints: 6,
    correctCount: 0,
    answeredCount: 1,
    taskIds: ["task-1"],
    outcomes: ["incorrect"],
    historyEntry: null,
  };
}

async function loadStore() {
  vi.resetModules();
  return import("./simulation-archive-store");
}

afterEach(() => {
  fetchArchive.mockReset();
});

describe("simulation archive ownership", () => {
  it("waits for auth and exposes an explicit guest view", async () => {
    const store = await loadStore();

    expect(store.simulationArchiveView()).toBeNull();
    await store.syncSimulationArchive(null);
    expect(store.simulationArchiveView()).toEqual({
      status: "guest",
      entries: [],
    });
  });

  it("isolates account switches and ignores a stale owner response", async () => {
    const store = await loadStore();
    let resolveA: ((value: SimulationArchiveRun[]) => void) | undefined;
    fetchArchive
      .mockReturnValueOnce(
        new Promise<SimulationArchiveRun[]>((resolve) => {
          resolveA = resolve;
        }),
      )
      .mockResolvedValueOnce([entry("8d04f81d-4435-4f7f-b314-2fe16334f0cf")]);

    const firstSync = store.syncSimulationArchive(USER_A);
    const secondSync = store.syncSimulationArchive(USER_B);
    await secondSync;
    resolveA?.([entry("5ff78318-3436-4b4e-99b8-77ef34366ad3")]);
    await firstSync;

    expect(store.simulationArchiveView()).toMatchObject({
      status: "synced",
      entries: [{ id: "8d04f81d-4435-4f7f-b314-2fe16334f0cf" }],
    });
    await store.syncSimulationArchive(null);
    expect(store.simulationArchiveView()).toEqual({
      status: "guest",
      entries: [],
    });
  });

  it("unblocks the UI with a degraded empty view on fetch failure", async () => {
    const store = await loadStore();
    fetchArchive.mockRejectedValueOnce(new Error("offline"));

    await store.syncSimulationArchive(USER_A);

    expect(store.simulationArchiveView()).toEqual({
      status: "degraded",
      entries: [],
    });
  });
});
