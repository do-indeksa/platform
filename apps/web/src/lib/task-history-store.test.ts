import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskHistoryEntry } from "./task-history";

const STORAGE_KEY = "do-indeksa-task-history";
const USER_A = "a0209703-275b-4c6e-b815-25025b923ae8";
const USER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

function entry(
  sequence: number,
  overrides: Partial<TaskHistoryEntry> = {},
): TaskHistoryEntry {
  return {
    id: `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`,
    taskId: `task-${sequence}`,
    slot: 1,
    source: "practice",
    outcome: "incorrect",
    answers: ["1"],
    helpLevel: 0,
    at: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

function mockStorage(initialEntries: TaskHistoryEntry[] = []) {
  const map = new Map<string, string>();
  if (initialEntries.length > 0) {
    map.set(
      STORAGE_KEY,
      JSON.stringify({ version: 1, entries: initialEntries }),
    );
  }
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  });
  return map;
}

function stored(map: Map<string, string>) {
  const raw = map.get(STORAGE_KEY);
  return raw
    ? (JSON.parse(raw) as {
        version: number;
        entries: Array<TaskHistoryEntry & { ownerId: string | null }>;
      })
    : { version: 0, entries: [] };
}

async function loadStore() {
  vi.resetModules();
  return import("./task-history-store");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task history ownership", () => {
  it("waits for auth before exposing persisted history", async () => {
    mockStorage([entry(1)]);
    const store = await loadStore();

    expect(store.taskHistoryView()).toBeNull();
    store.syncTaskHistory(null);
    expect(store.taskHistoryView()).toEqual([entry(1)]);
  });

  it("claims legacy guest rows and isolates account switches", async () => {
    const map = mockStorage([entry(1)]);
    const store = await loadStore();

    store.syncTaskHistory(USER_A);
    expect(store.taskHistoryView()).toEqual([entry(1)]);
    expect(stored(map)).toMatchObject({
      version: 2,
      entries: [{ id: entry(1).id, ownerId: USER_A }],
    });

    store.syncTaskHistory(USER_B);
    expect(store.taskHistoryView()).toEqual([]);
    const [created] = store.recordTaskHistory([
      {
        taskId: "task-2",
        slot: 1,
        source: "practice",
        outcome: "correct",
        answers: ["2"],
        helpLevel: 0,
        at: "2026-08-10T11:00:00.000Z",
      },
    ]);
    expect(store.taskHistoryView()).toEqual([created]);

    store.syncTaskHistory(null);
    expect(store.taskHistoryView()).toEqual([]);
    store.syncTaskHistory(USER_A);
    expect(store.taskHistoryView()).toEqual([entry(1)]);
  });

  it("cannot update a hidden account row", async () => {
    const map = mockStorage([entry(1)]);
    const store = await loadStore();
    store.syncTaskHistory(USER_A);
    store.syncTaskHistory(USER_B);

    store.markTaskHistoryHelp(entry(1).id, 3);

    expect(
      stored(map).entries.find(({ id }) => id === entry(1).id),
    ).toMatchObject({ helpLevel: 0, ownerId: USER_A });
  });
});
