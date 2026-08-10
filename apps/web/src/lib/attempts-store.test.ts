import { afterEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "./knowledge";

const STORAGE_KEY = "do-indeksa-attempts";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";

type StoredAttempt = Attempt & {
  transport?: "graphql";
  runId?: string;
};

function mockStorage(initial: unknown[] = []) {
  const map = new Map<string, string>();
  if (initial.length > 0) {
    map.set(STORAGE_KEY, JSON.stringify({ version: 1, attempts: initial }));
  }
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  return map;
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return Promise.resolve(respond(call));
    }),
  );
  return calls;
}

function posts(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => call.init?.method === "POST");
}

function stored(map: Map<string, string>): StoredAttempt[] {
  const raw = map.get(STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { attempts: StoredAttempt[] }).attempts;
}

function attempt(taskId: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    taskId,
    slot: 1,
    correct: true,
    source: "practice",
    helpLevel: 0,
    at: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

async function loadStore() {
  vi.resetModules();
  return import("./attempts-store");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordAttempts", () => {
  it("replaces a consecutive practice re-mark of the same task", async () => {
    const map = mockStorage();
    mockFetch(() => new Response(null, { status: 204 }));
    const store = await loadStore();

    store.recordAttempts([
      { taskId: "kb-001", slot: 1, correct: true, source: "practice" },
    ]);
    store.recordAttempts([
      { taskId: "kb-001", slot: 1, correct: false, source: "practice" },
    ]);

    const journal = stored(map);
    expect(journal).toHaveLength(1);
    expect(journal[0].correct).toBe(false);
  });

  it("keeps a non-zero helpLevel through the dedup replacement", async () => {
    const map = mockStorage();
    mockFetch(() => new Response(null, { status: 204 }));
    const store = await loadStore();

    store.recordAttempts([
      { taskId: "kb-001", slot: 1, correct: false, source: "practice" },
    ]);
    store.recordAttempts([
      {
        taskId: "kb-001",
        slot: 1,
        correct: true,
        source: "practice",
        helpLevel: 2,
      },
    ]);

    const journal = stored(map);
    expect(journal).toHaveLength(1);
    expect(journal[0].helpLevel).toBe(2);
  });

  it("rejects a fractional helpLevel from storage", async () => {
    mockStorage([attempt("kb-001", { helpLevel: 1.5 })]);
    mockFetch(() => Response.json([]));
    const store = await loadStore();

    await store.syncAttempts(false);

    expect(store.attemptsView()).toHaveLength(0);
  });

  it("appends across different tasks and sources", async () => {
    const map = mockStorage();
    mockFetch(() => new Response(null, { status: 204 }));
    const store = await loadStore();

    store.recordAttempts([
      { taskId: "kb-001", slot: 1, correct: true, source: "practice" },
    ]);
    store.recordAttempts([
      { taskId: "kb-002", slot: 1, correct: true, source: "practice" },
    ]);
    store.recordAttempts([
      { taskId: "kb-002", slot: 1, correct: true, source: "diagnostic" },
    ]);

    expect(stored(map)).toHaveLength(3);
  });
});

describe("syncAttempts", () => {
  it("flushes the journal in chunks of 500 and clears sent entries", async () => {
    const journal = Array.from({ length: 501 }, (_, i) => attempt(`t-${i}`));
    const map = mockStorage(journal);
    const calls = mockFetch((call) =>
      call.init?.method === "POST"
        ? new Response(null, { status: 204 })
        : Response.json([]),
    );
    const store = await loadStore();

    await store.syncAttempts(true);

    const sent = posts(calls);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0].init?.body as string)).toHaveLength(500);
    expect(JSON.parse(sent[1].init?.body as string)).toHaveLength(1);
    expect(stored(map)).toHaveLength(0);
  });

  it("keeps entries locally and degrades to the local view when the server fails", async () => {
    const journal = [attempt("kb-001"), attempt("kb-002")];
    const map = mockStorage(journal);
    mockFetch(() => new Response(null, { status: 502 }));
    const store = await loadStore();

    await store.syncAttempts(true);

    expect(stored(map)).toHaveLength(2);
    expect(store.attemptsView()).toHaveLength(2);
  });

  it("drops a chunk the server rejects as invalid", async () => {
    const map = mockStorage([attempt("kb-001")]);
    mockFetch((call) =>
      call.init?.method === "POST"
        ? Response.json(
            { code: "invalid_attempt", message: "" },
            { status: 400 },
          )
        : Response.json([]),
    );
    const store = await loadStore();

    await store.syncAttempts(true);

    expect(stored(map)).toHaveLength(0);
  });

  it("defaults helpLevel for entries stored before the field existed", async () => {
    const legacy = Object.fromEntries(
      Object.entries(attempt("kb-001")).filter(([key]) => key !== "helpLevel"),
    );
    mockStorage([legacy]);
    mockFetch(() => Response.json([]));
    const store = await loadStore();

    await store.syncAttempts(false);

    expect(store.attemptsView()).toEqual([{ ...legacy, helpLevel: 0 }]);
  });

  it("filters corrupt localStorage entries", async () => {
    const map = mockStorage([
      attempt("kb-001"),
      attempt("", {}),
      attempt("kb-003", { slot: 99 }),
      "garbage",
    ]);
    mockFetch(() => Response.json([]));
    const store = await loadStore();

    await store.syncAttempts(false);

    expect(store.attemptsView()).toHaveLength(1);
    expect(stored(map)).toHaveLength(4);
  });

  it("keeps flushed attempts visible when the follow-up fetch fails", async () => {
    const map = mockStorage([attempt("kb-001"), attempt("kb-002")]);
    mockFetch((call) =>
      call.init?.method === "POST"
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 502 }),
    );
    const store = await loadStore();

    await store.syncAttempts(true);

    expect(stored(map)).toHaveLength(0);
    expect(store.attemptsView()).toHaveLength(2);
  });

  it("flushes REST attempts without duplicating GraphQL-owned attempts", async () => {
    const map = mockStorage();
    const calls = mockFetch((call) =>
      call.init?.method === "POST"
        ? new Response(null, { status: 204 })
        : Response.json([]),
    );
    const store = await loadStore();

    expect(
      store.recordGraphQLAttempts(runId, [
        attempt("kb-001", { source: "diagnostic" }),
      ]),
    ).toBe(true);
    store.recordAttempts([
      { taskId: "kb-002", slot: 1, correct: true, source: "practice" },
    ]);
    await store.syncAttempts(true);

    expect(posts(calls)).toHaveLength(1);
    expect(JSON.parse(posts(calls)[0].init?.body as string)).toEqual([
      expect.objectContaining({ taskId: "kb-002" }),
    ]);
    expect(stored(map)).toEqual([
      expect.objectContaining({
        taskId: "kb-001",
        transport: "graphql",
        runId,
      }),
    ]);
    expect(store.attemptsView()).toEqual([
      expect.not.objectContaining({ transport: expect.anything() }),
    ]);
  });

  it("removes a GraphQL fallback only after refreshing the server view", async () => {
    const map = mockStorage();
    let reads = 0;
    mockFetch(() => {
      reads += 1;
      return Response.json(
        reads === 1 ? [] : [attempt("kb-001", { source: "diagnostic" })],
      );
    });
    const store = await loadStore();

    await store.syncAttempts(true);
    store.recordGraphQLAttempts(runId, [
      attempt("kb-001", { source: "diagnostic" }),
    ]);

    expect(await store.acknowledgeGraphQLRun(runId)).toBe(true);
    expect(stored(map)).toHaveLength(0);
    expect(store.attemptsView()).toEqual([
      attempt("kb-001", { source: "diagnostic" }),
    ]);
  });

  it("retains a GraphQL fallback when the server view cannot refresh", async () => {
    const map = mockStorage();
    let reads = 0;
    mockFetch(() =>
      ++reads === 1 ? Response.json([]) : new Response(null, { status: 502 }),
    );
    const store = await loadStore();

    await store.syncAttempts(true);
    store.recordGraphQLAttempts(runId, [
      attempt("kb-001", { source: "diagnostic" }),
    ]);

    expect(await store.acknowledgeGraphQLRun(runId)).toBe(false);
    expect(stored(map)).toHaveLength(1);
    expect(store.attemptsView()).toHaveLength(1);
  });

  it("filters malformed GraphQL ownership metadata", async () => {
    mockStorage([
      {
        ...attempt("kb-001", { source: "diagnostic" }),
        transport: "graphql",
        runId: "not-a-uuid",
      },
    ]);
    mockFetch(() => Response.json([]));
    const store = await loadStore();

    await store.syncAttempts(false);

    expect(store.attemptsView()).toHaveLength(0);
  });

  it("merges server and local views sorted by time", async () => {
    mockStorage([attempt("local-1", { at: "2026-07-12T12:00:00.000Z" })]);
    mockFetch((call) =>
      call.init?.method === "POST"
        ? new Response(null, { status: 502 })
        : Response.json([
            attempt("server-1", { at: "2026-07-12T11:00:00.000Z" }),
            attempt("server-2", { at: "2026-07-12T13:00:00.000Z" }),
          ]),
    );
    const store = await loadStore();

    await store.syncAttempts(true);

    const view = store.attemptsView();
    expect(view?.map((entry) => entry.taskId)).toEqual([
      "server-1",
      "local-1",
      "server-2",
    ]);
  });
});

describe("clearLocalAttempts", () => {
  it("empties the local journal", async () => {
    const map = mockStorage([attempt("kb-001")]);
    mockFetch(() => Response.json([]));
    const store = await loadStore();

    store.clearLocalAttempts();

    expect(stored(map)).toHaveLength(0);
  });
});
