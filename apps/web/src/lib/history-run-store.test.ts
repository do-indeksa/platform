import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userA = "39ec4650-762d-437f-9917-c31ab167cb99";
const userB = "4bf2df3e-c168-4c37-9384-7acdd229a035";
const runA = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const runB = "8d04f81d-4435-4f7f-b314-2fe16334f0cf";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe("history run store", () => {
  it("exposes an honest empty guest snapshot without a request", async () => {
    const store = await import("./history-run-store");

    expect(store.historyRunView()).toBeNull();
    store.prepareHistoryRuns(null);
    await store.syncHistoryRuns(null);

    expect(store.historyRunView()).toEqual({ status: "guest", entries: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fetch before the owner is explicitly activated", async () => {
    const store = await import("./history-run-store");

    await store.syncHistoryRuns(userA);

    expect(fetch).not.toHaveBeenCalled();
    expect(store.historyRunView()).toBeNull();
  });

  it("keeps a stale owner response out of the next owner view", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response([run(runB)]));

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    const first = store.syncHistoryRuns(userA);
    store.prepareHistoryRuns(userB);
    const second = store.syncHistoryRuns(userB);
    await second;
    resolveFirst?.(response([run(runA)]));
    await first;

    expect(store.historyRunView()).toMatchObject({
      status: "synced",
      entries: [{ id: runB }],
    });
  });

  it("preserves visible entries during refresh and transient degradation", async () => {
    let resolveRefresh: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([run(runA)]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    await store.syncHistoryRuns(userA);
    const refresh = store.syncHistoryRuns(userA);
    await vi.waitFor(() => expect(resolveRefresh).toBeDefined());

    expect(store.historyRunView()).toMatchObject({
      status: "synced",
      entries: [{ id: runA }],
    });
    resolveRefresh?.(new Response(null, { status: 503 }));
    await refresh;
    expect(store.historyRunView()).toMatchObject({
      status: "degraded",
      entries: [{ id: runA }],
    });
  });

  it("applies only the latest concurrent refresh for one owner", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response([run(runB)]));

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    const first = store.syncHistoryRuns(userA);
    const second = store.syncHistoryRuns(userA);
    await second;
    resolveFirst?.(response([run(runA)]));
    await first;

    expect(store.historyRunView()).toMatchObject({
      status: "synced",
      entries: [{ id: runB }],
    });
  });

  it("ignores an obsolete external refresh without degrading visible entries", async () => {
    let resolveRefresh: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([run(runA)]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    await store.syncHistoryRuns(userA);
    let current = true;
    const refresh = store.syncHistoryRuns(userA, {
      isCurrentOwner: () => current,
    });
    await vi.waitFor(() => expect(resolveRefresh).toBeDefined());
    current = false;
    resolveRefresh?.(new Response(null, { status: 503 }));
    await refresh;

    expect(store.historyRunView()).toMatchObject({
      status: "synced",
      entries: [{ id: runA }],
    });
  });

  it("fails closed across an A-B-A owner transition", async () => {
    let resolveOldA: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOldA = resolve;
          }),
      )
      .mockResolvedValueOnce(response([run(runB)]));

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    const oldA = store.syncHistoryRuns(userA);
    store.prepareHistoryRuns(userB);
    store.prepareHistoryRuns(userA);
    await store.syncHistoryRuns(userA);
    resolveOldA?.(response([run(runA)]));
    await oldA;

    expect(store.historyRunView()).toMatchObject({
      status: "synced",
      entries: [{ id: runB }],
    });
  });

  it("reports degraded state after a failed initial owner request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);

    await store.syncHistoryRuns(userA);

    expect(store.historyRunView()).toEqual({
      status: "degraded",
      entries: [],
    });
  });
});

function run(id: string) {
  return {
    id,
    kind: "PRACTICE",
    status: "SUBMITTED",
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: `sha256:${"a".repeat(64)}`,
    startedAt: "2026-08-10T10:00:00.000Z",
    submittedAt: "2026-08-10T10:20:00.000Z",
    activeDurationMs: 1_100_000,
    taskIds: ["kb-001"],
    itemCount: 1,
    completedItemCount: 1,
    correctItemCount: 1,
    earnedPoints: null,
    maxPoints: null,
  };
}

function response(runs: unknown[]): Response {
  return Response.json({ data: { runs } });
}
