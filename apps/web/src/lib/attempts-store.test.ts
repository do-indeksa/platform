import { afterEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "./knowledge";

const STORAGE_KEY = "do-indeksa-attempts";

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

function stored(map: Map<string, string>): Attempt[] {
  const raw = map.get(STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { attempts: Attempt[] }).attempts;
}

function attempt(taskId: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    taskId,
    slot: 1,
    correct: true,
    source: "practice",
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
    expect(map).toBeDefined();
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
