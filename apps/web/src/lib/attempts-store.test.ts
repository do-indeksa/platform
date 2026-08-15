import { afterEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "./knowledge";

const STORAGE_KEY = "do-indeksa-attempts";
const USER_A = "a0209703-275b-4c6e-b815-25025b923ae8";
const USER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
const RUN_ID = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const REVISION = `sha256:${"a".repeat(64)}`;
const ATTEMPT_ID = "cb973bed-6f86-410b-89fa-26bedc57cf1e";
const SERVER_ID = "c4f8fe8b-8898-4dc8-8e67-15837b1fdb91";

type FetchCall = { url: string; init?: RequestInit };

function mockStorage(initial: unknown[] = [], version = 2) {
  const map = new Map<string, string>();
  if (initial.length > 0) {
    map.set(STORAGE_KEY, JSON.stringify({ version, attempts: initial }));
  }
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  return map;
}

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

function body(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function operation(call: FetchCall): string | undefined {
  return body(call).operationName as string | undefined;
}

function stored(map: Map<string, string>): Record<string, unknown>[] {
  const raw = map.get(STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { attempts: Record<string, unknown>[] }).attempts;
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

function practiceInput(taskId = "kb-001") {
  return {
    taskId,
    slot: 1,
    taskRevision: REVISION,
    startedAt: "2026-07-12T09:59:50.000Z",
    submittedAt: "2026-07-12T10:00:00.000Z",
    activeDurationMs: 10_000,
    answer: JSON.stringify(["2", "3"]),
    outcome: "CORRECT" as const,
    helpLevel: 1,
  };
}

function pendingAttempt(
  ownerId: string | null,
  id = ATTEMPT_ID,
  taskId = "kb-001",
) {
  return {
    ...attempt(taskId, { helpLevel: 1 }),
    transport: "graphql-standalone",
    ownerId,
    input: {
      id,
      standalone: {
        taskId,
        examPosition: 1,
        taskRevision: REVISION,
      },
      startedAt: "2026-07-12T09:59:50.000Z",
      submittedAt: "2026-07-12T10:00:00.000Z",
      activeDurationMs: 10_000,
      answer: JSON.stringify(["2", "3"]),
      outcome: "CORRECT",
      helpLevel: 1,
      gradingKind: "AUTO",
    },
  };
}

function serverAttempt(
  id = SERVER_ID,
  taskId = "kb-001",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    runItemId: null,
    taskId,
    examPosition: 1,
    mode: "PRACTICE",
    startedAt: "2026-07-12T09:59:50.000Z",
    submittedAt: "2026-07-12T10:00:00.000Z",
    activeDurationMs: 10_000,
    answer: JSON.stringify(["2", "3"]),
    outcome: "CORRECT",
    helpLevel: 1,
    gradingKind: "AUTO",
    earnedPoints: null,
    maxPoints: null,
    taskRevision: REVISION,
    ...overrides,
  };
}

function journal(entries: unknown[] = []): Response {
  return Response.json({ data: { attempts: entries } });
}

function recorded(id: string): Response {
  return Response.json({ data: { recordAttempt: { id } } });
}

async function loadStore() {
  vi.resetModules();
  return import("./attempts-store");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordPracticeAttempt", () => {
  it("stores a rich v2 journal entry for a guest", async () => {
    const map = mockStorage();
    mockFetch(() => journal());
    const store = await loadStore();
    await store.syncAttempts(null);

    expect(store.recordPracticeAttempt(practiceInput())).toBe(true);

    const [entry] = stored(map);
    expect(JSON.parse(map.get(STORAGE_KEY) ?? "{}").version).toBe(2);
    expect(entry).toMatchObject({
      taskId: "kb-001",
      correct: true,
      source: "practice",
      helpLevel: 1,
      transport: "graphql-standalone",
      ownerId: null,
      input: {
        standalone: { taskRevision: REVISION },
        activeDurationMs: 10_000,
        answer: '["2","3"]',
        outcome: "CORRECT",
        gradingKind: "AUTO",
      },
    });
    expect((entry.input as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.attemptJournalView()).toMatchObject({
      status: "guest",
      entries: [
        {
          taskId: "kb-001",
          answer: '["2","3"]',
          outcome: "CORRECT",
          taskRevision: REVISION,
        },
      ],
    });
  });

  it("keeps each checked answer as a separate journal event", async () => {
    const map = mockStorage();
    mockFetch(() => journal());
    const store = await loadStore();
    await store.syncAttempts(null);

    store.recordPracticeAttempt(practiceInput());
    store.recordPracticeAttempt({
      ...practiceInput(),
      outcome: "INCORRECT",
      helpLevel: 2,
    });

    expect(stored(map)).toHaveLength(2);
    expect(
      stored(map).map((entry) => (entry.input as { outcome: string }).outcome),
    ).toEqual(["CORRECT", "INCORRECT"]);
  });

  it("rejects malformed client metadata", async () => {
    const map = mockStorage();
    mockFetch(() => journal());
    const store = await loadStore();
    await store.syncAttempts(null);

    expect(
      store.recordPracticeAttempt({
        ...practiceInput(),
        taskRevision: "latest",
      }),
    ).toBe(false);
    expect(stored(map)).toEqual([]);
  });

  it("keeps a solution reveal in the rich journal but out of mastery", async () => {
    const map = mockStorage();
    mockFetch(() => journal());
    const store = await loadStore();
    await store.syncAttempts(null);

    expect(
      store.recordPracticeAttempt({
        ...practiceInput(),
        outcome: "SKIPPED",
        helpLevel: 3,
      }),
    ).toBe(true);

    expect(stored(map)).toHaveLength(1);
    expect(store.attemptsView()).toEqual([]);
    expect(store.attemptJournalView()).toMatchObject({
      status: "guest",
      entries: [{ outcome: "SKIPPED", helpLevel: 3 }],
    });
  });
});

describe("syncAttempts", () => {
  it("claims a guest attempt and submits it exactly once", async () => {
    const map = mockStorage([pendingAttempt(null)]);
    let saved = false;
    const calls = mockFetch((call) => {
      if (operation(call) === "RecordPracticeAttempt") {
        saved = true;
        const input = (body(call).variables as { input: { id: string } }).input;
        return recorded(input.id);
      }
      return journal(saved ? [serverAttempt(ATTEMPT_ID)] : []);
    });
    const store = await loadStore();

    await store.syncAttempts(USER_A);
    await store.syncAttempts(USER_A);

    expect(
      calls.filter((call) => operation(call) === "RecordPracticeAttempt"),
    ).toHaveLength(1);
    expect(stored(map)).toEqual([]);
    expect(store.attemptsView()).toEqual([attempt("kb-001", { helpLevel: 1 })]);
    expect(store.attemptJournalView()).toMatchObject({
      status: "synced",
      entries: [{ id: ATTEMPT_ID, answer: '["2","3"]' }],
    });
  });

  it("reuses the same UUID after a transient mutation failure", async () => {
    const map = mockStorage([pendingAttempt(null)]);
    let mutations = 0;
    let saved = false;
    const ids: string[] = [];
    mockFetch((call) => {
      if (operation(call) === "RecordPracticeAttempt") {
        mutations += 1;
        const input = (body(call).variables as { input: { id: string } }).input;
        ids.push(input.id);
        if (mutations === 1) return new Response(null, { status: 502 });
        saved = true;
        return recorded(input.id);
      }
      return journal(saved ? [serverAttempt(ATTEMPT_ID)] : []);
    });
    const store = await loadStore();

    await store.syncAttempts(USER_A);
    expect(stored(map)).toHaveLength(1);
    expect(store.attemptJournalView()?.status).toBe("degraded");
    await store.syncAttempts(USER_A);

    expect(ids).toEqual([ATTEMPT_ID, ATTEMPT_ID]);
    expect(stored(map)).toEqual([]);
    expect(store.attemptJournalView()?.status).toBe("synced");
  });

  it("deduplicates an ambiguous mutation already present in the journal", async () => {
    const map = mockStorage([pendingAttempt(null)]);
    mockFetch((call) =>
      operation(call) === "RecordPracticeAttempt"
        ? new Response(null, { status: 502 })
        : journal([serverAttempt(ATTEMPT_ID)]),
    );
    const store = await loadStore();

    await store.syncAttempts(USER_A);

    expect(stored(map)).toHaveLength(1);
    expect(store.attemptsView()).toEqual([attempt("kb-001", { helpLevel: 1 })]);
    expect(store.attemptJournalView()?.status).toBe("synced");
  });

  it("drains legacy v1 entries through REST in bounded batches", async () => {
    const legacy = Array.from({ length: 501 }, (_, index) =>
      attempt(`t-${index}`),
    );
    const map = mockStorage(legacy, 1);
    const calls = mockFetch((call) =>
      call.url === "/api/v1/attempts"
        ? new Response(null, { status: 204 })
        : journal(),
    );
    const store = await loadStore();

    await store.syncAttempts(USER_A);

    const restCalls = calls.filter((call) => call.url === "/api/v1/attempts");
    expect(restCalls).toHaveLength(2);
    expect(JSON.parse(String(restCalls[0].init?.body))).toHaveLength(500);
    expect(JSON.parse(String(restCalls[1].init?.body))).toHaveLength(1);
    expect(stored(map)).toEqual([]);
    expect(calls.some((call) => operation(call) === "AttemptJournal")).toBe(
      true,
    );
  });

  it("keeps a failed rich attempt in the local signed-in view", async () => {
    const map = mockStorage([pendingAttempt(null)]);
    mockFetch((call) =>
      operation(call) === "AttemptJournal"
        ? new Response(null, { status: 502 })
        : new Response(null, { status: 503 }),
    );
    const store = await loadStore();

    await store.syncAttempts(USER_A);

    expect(stored(map)).toHaveLength(1);
    expect(stored(map)[0].ownerId).toBe(USER_A);
    expect(store.attemptsView()).toEqual([attempt("kb-001", { helpLevel: 1 })]);
    expect(store.attemptJournalView()).toMatchObject({
      status: "degraded",
      entries: [{ id: ATTEMPT_ID }],
    });
  });

  it("does not expose or submit another account's pending entries", async () => {
    const map = mockStorage([pendingAttempt(USER_A)]);
    const calls = mockFetch(() => journal());
    const store = await loadStore();

    await store.syncAttempts(USER_B);

    expect(
      calls.filter((call) => operation(call) === "RecordPracticeAttempt"),
    ).toHaveLength(0);
    expect(store.attemptsView()).toEqual([]);
    expect(store.attemptJournalView()).toEqual({
      status: "synced",
      entries: [],
    });
    expect(stored(map)).toHaveLength(1);
  });

  it("finishes a stale rich mutation without exposing it to the next account", async () => {
    const map = mockStorage([pendingAttempt(null)]);
    let resolveMutation: ((response: Response) => void) | undefined;
    const calls = mockFetch((call) => {
      if (operation(call) === "RecordPracticeAttempt") {
        return new Promise<Response>((resolve) => {
          resolveMutation = resolve;
        });
      }
      return journal();
    });
    const store = await loadStore();

    const first = store.syncAttempts(USER_A);
    await vi.waitFor(() => expect(resolveMutation).toBeTypeOf("function"));
    const second = store.syncAttempts(USER_B);
    expect(stored(map)[0]).toMatchObject({ ownerId: USER_A });
    resolveMutation?.(recorded(ATTEMPT_ID));
    await first;
    await second;

    expect(
      calls.filter((call) => operation(call) === "RecordPracticeAttempt"),
    ).toHaveLength(1);
    expect(stored(map)).toEqual([]);
    expect(store.attemptsView()).toEqual([]);
  });

  it("claims a legacy row before REST so an account switch cannot resend it", async () => {
    const map = mockStorage([attempt("kb-001")], 1);
    let resolveLegacy: ((response: Response) => void) | undefined;
    const calls = mockFetch((call) => {
      if (call.url === "/api/v1/attempts") {
        return new Promise<Response>((resolve) => {
          resolveLegacy = resolve;
        });
      }
      return journal();
    });
    const store = await loadStore();

    const first = store.syncAttempts(USER_A);
    await vi.waitFor(() => expect(resolveLegacy).toBeTypeOf("function"));
    const second = store.syncAttempts(USER_B);
    expect(stored(map)[0]).toMatchObject({
      transport: "rest-legacy",
      ownerId: USER_A,
    });
    resolveLegacy?.(new Response(null, { status: 204 }));
    await first;
    await second;

    expect(
      calls.filter((call) => call.url === "/api/v1/attempts"),
    ).toHaveLength(1);
    expect(stored(map)).toEqual([]);
    expect(store.attemptsView()).toEqual([]);
  });

  it("invalidates an in-flight journal across sign-out and account change", async () => {
    mockStorage();
    const resolvers: ((response: Response) => void)[] = [];
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const store = await loadStore();

    const first = store.syncAttempts(USER_A);
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    await store.syncAttempts(null);
    resolvers[0](journal([serverAttempt()]));
    await first;
    expect(store.attemptsView()).toEqual([]);

    const second = store.syncAttempts(USER_B);
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    expect(store.attemptsView()).toBeNull();
    resolvers[1](journal());
    await second;
    expect(store.attemptsView()).toEqual([]);
  });

  it("merges the server journal and local fallback chronologically", async () => {
    mockStorage([
      pendingAttempt(USER_A, ATTEMPT_ID, "local-1"),
      {
        ...attempt("run-local", {
          source: "diagnostic",
          at: "2026-07-12T12:00:00.000Z",
        }),
        transport: "graphql",
        runId: RUN_ID,
        ownerId: USER_A,
      },
    ]);
    mockFetch((call) =>
      operation(call) === "RecordPracticeAttempt"
        ? new Response(null, { status: 502 })
        : journal([
            serverAttempt(SERVER_ID, "server-1", {
              submittedAt: "2026-07-12T11:00:00.000Z",
            }),
            serverAttempt("89f60fb8-521a-48f6-becd-3ba25ef9898e", "server-2", {
              submittedAt: "2026-07-12T13:00:00.000Z",
            }),
          ]),
    );
    const store = await loadStore();

    await store.syncAttempts(USER_A);

    expect(store.attemptsView()?.map((entry) => entry.taskId)).toEqual([
      "local-1",
      "server-1",
      "run-local",
      "server-2",
    ]);
  });
});

describe("GraphQL run fallback", () => {
  it("removes a run fallback only after a valid journal refresh", async () => {
    const map = mockStorage();
    let reads = 0;
    mockFetch(() => {
      reads += 1;
      return journal(
        reads === 1
          ? []
          : [
              serverAttempt(SERVER_ID, "kb-001", {
                mode: "DIAGNOSTIC",
                helpLevel: 0,
              }),
            ],
      );
    });
    const store = await loadStore();
    await store.syncAttempts(USER_A);
    expect(
      store.recordGraphQLAttempts(RUN_ID, [
        attempt("kb-001", { source: "diagnostic" }),
      ]),
    ).toBe(true);

    expect(await store.acknowledgeGraphQLRun(RUN_ID)).toBe(true);

    expect(stored(map)).toEqual([]);
    expect(store.attemptsView()).toEqual([
      attempt("kb-001", { source: "diagnostic" }),
    ]);
  });

  it("retains a run fallback when the journal cannot refresh", async () => {
    const map = mockStorage();
    let reads = 0;
    mockFetch(() =>
      ++reads === 1 ? journal() : new Response(null, { status: 502 }),
    );
    const store = await loadStore();
    await store.syncAttempts(USER_A);
    store.recordGraphQLAttempts(RUN_ID, [
      attempt("kb-001", { source: "diagnostic" }),
    ]);

    expect(await store.acknowledgeGraphQLRun(RUN_ID)).toBe(false);
    expect(stored(map)).toHaveLength(1);
    expect(store.attemptsView()).toHaveLength(1);
  });
});

describe("practice runtime canonical fallback", () => {
  it("does not degrade the journal when an obsolete acknowledgement is aborted", async () => {
    mockStorage();
    let reads = 0;
    let rejectAcknowledgement: ((reason?: unknown) => void) | undefined;
    mockFetch(() => {
      reads += 1;
      if (reads === 1) return journal();
      return new Promise<Response>((_resolve, reject) => {
        rejectAcknowledgement = reject;
      });
    });
    const store = await loadStore();
    await store.syncAttempts(USER_A);
    expect(store.attemptJournalView()?.status).toBe("synced");

    let runtimeOwnerCurrent = true;
    const acknowledgement = store.acknowledgePracticeRuntimeRun(
      USER_A,
      [ATTEMPT_ID],
      () => runtimeOwnerCurrent,
    );
    await vi.waitFor(() => expect(rejectAcknowledgement).toBeDefined());
    runtimeOwnerCurrent = false;
    rejectAcknowledgement?.(new DOMException("aborted", "AbortError"));

    expect(await acknowledgement).toBe(false);
    expect(store.attemptJournalView()?.status).toBe("synced");
  });

  it("projects the deterministic attempt once and drops its pending standalone copy", async () => {
    const map = mockStorage();
    const calls = mockFetch((call) => {
      if (operation(call) === "RecordPracticeAttempt") {
        const input = (body(call).variables as { input: { id: string } }).input;
        return recorded(input.id);
      }
      return journal();
    });
    const store = await loadStore();
    const runtime = await import("./practice-runtime-store");
    await store.syncAttempts(null);
    runtime.syncPracticeRuntimeOwner(null);
    expect(
      runtime.usePracticeRuntime.getState().start({
        assignment: {
          runId: RUN_ID,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: `sha256:${"b".repeat(64)}`,
          tasks: [
            {
              id: "kb-001",
              revision: REVISION,
              slot: 1,
              topic: "kompleksni-brojevi",
              answerPartCount: 2,
            },
          ],
        },
        startedAt: Date.parse("2026-07-12T09:59:00.000Z"),
      }),
    ).toBe(true);
    expect(store.recordPracticeAttempt(practiceInput())).toBe(true);
    const canonicalId = runtime.usePracticeRuntime
      .getState()
      .appendAttempt(RUN_ID, {
        taskId: "kb-001",
        startedAt: Date.parse("2026-07-12T09:59:50.000Z"),
        submittedAt: Date.parse("2026-07-12T10:00:00.000Z"),
        activeDurationMs: 10_000,
        answers: ["2", "3"],
        outcome: "correct",
        helpLevel: 1,
        currentIndex: 0,
        runActiveDurationMs: 10_000,
      });
    expect(canonicalId).not.toBeNull();

    expect(store.attemptsView()).toEqual([attempt("kb-001", { helpLevel: 1 })]);
    expect(store.attemptJournalView()).toMatchObject({
      status: "guest",
      entries: [
        {
          id: canonicalId,
          runItemId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          taskId: "kb-001",
          answer: '["2","3"]',
          outcome: "CORRECT",
          taskRevision: REVISION,
        },
      ],
    });

    runtime.syncPracticeRuntimeOwner(USER_A);
    await store.syncAttempts(USER_A);

    expect(
      calls.filter((call) => operation(call) === "RecordPracticeAttempt"),
    ).toHaveLength(0);
    expect(stored(map)).toEqual([]);
    expect(store.attemptJournalView()).toMatchObject({
      status: "degraded",
      entries: [{ id: canonicalId }],
    });
  });

  it("fails closed across an A-B-A runtime owner transition", async () => {
    mockStorage();
    mockFetch(() => journal());
    const store = await loadStore();
    const runtime = await import("./practice-runtime-store");
    runtime.syncPracticeRuntimeOwner(null);
    expect(
      runtime.usePracticeRuntime.getState().start({
        assignment: {
          runId: RUN_ID,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: `sha256:${"b".repeat(64)}`,
          tasks: [
            {
              id: "kb-001",
              revision: REVISION,
              slot: 1,
              topic: "kompleksni-brojevi",
              answerPartCount: 2,
            },
          ],
        },
        startedAt: Date.parse("2026-07-12T09:59:00.000Z"),
      }),
    ).toBe(true);
    expect(
      runtime.usePracticeRuntime.getState().appendAttempt(RUN_ID, {
        taskId: "kb-001",
        startedAt: Date.parse("2026-07-12T09:59:50.000Z"),
        submittedAt: Date.parse("2026-07-12T10:00:00.000Z"),
        activeDurationMs: 10_000,
        answers: ["2", "3"],
        outcome: "correct",
        helpLevel: 1,
        currentIndex: 0,
        runActiveDurationMs: 10_000,
      }),
    ).not.toBeNull();

    runtime.syncPracticeRuntimeOwner(USER_A);
    await store.syncAttempts(USER_A);
    expect(store.attemptJournalView()?.entries).toHaveLength(1);

    runtime.syncPracticeRuntimeOwner(USER_B);
    await store.syncAttempts(USER_B);
    runtime.syncPracticeRuntimeOwner(USER_A);
    await store.syncAttempts(USER_A);

    expect(store.attemptsView()).toEqual([]);
    expect(store.attemptJournalView()?.entries).toEqual([]);
  });
});

describe("clearLocalAttempts", () => {
  it("empties the journal and invalidates the signed-in view", async () => {
    const map = mockStorage([pendingAttempt(USER_A)]);
    mockFetch(() => journal());
    const store = await loadStore();

    store.clearLocalAttempts();

    expect(stored(map)).toEqual([]);
    expect(store.attemptsView()).toEqual([]);
  });

  it("clears the in-memory guest view when browser removal fails", async () => {
    const raw = JSON.stringify({
      version: 1,
      attempts: [attempt("kb-001")],
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => raw),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    });
    mockFetch(() => journal());
    const store = await loadStore();
    await store.syncAttempts(null);
    expect(store.attemptsView()).toHaveLength(1);

    store.clearLocalAttempts();

    expect(store.attemptsView()).toEqual([]);
  });
});
