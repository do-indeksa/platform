import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userA = "39ec4650-762d-437f-9917-c31ab167cb99";
const userB = "4bf2df3e-c168-4c37-9384-7acdd229a035";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe("history run store", () => {
  it("exposes an honest empty guest snapshot without a request", async () => {
    const store = await import("./history-run-store");
    await store.syncHistoryRuns(null);
    expect(store.historyRunView()).toEqual({
      status: "guest",
      entries: [],
      latestSubmittedDiagnostic: null,
    });
    expect(fetch).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce(response([]));

    const store = await import("./history-run-store");
    const first = store.syncHistoryRuns(userA);
    const second = store.syncHistoryRuns(userB);
    await second;
    resolveFirst?.(response([]));
    await first;
    expect(store.historyRunView()).toEqual({
      status: "synced",
      entries: [],
      latestSubmittedDiagnostic: null,
    });
  });

  it("keeps the newest refresh when same-owner responses arrive out of order", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response([historyRun(runB)]));

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    const first = store.refreshHistoryRuns(userA);
    await store.refreshHistoryRuns(userA);
    resolveFirst?.(response([historyRun(runA)]));
    await first;

    expect(store.historyRunView()?.status).toBe("synced");
    expect(store.historyRunView()?.entries.map(({ id }) => id)).toEqual([runB]);
  });

  it("rejects an earlier A response after an A-B-A owner cycle", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response([historyRun(runB)]));

    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);
    const first = store.refreshHistoryRuns(userA);
    store.prepareHistoryRuns(userB);
    store.prepareHistoryRuns(userA);
    await store.refreshHistoryRuns(userA);
    resolveFirst?.(response([historyRun(runA)]));
    await first;

    expect(store.historyRunView()?.status).toBe("synced");
    expect(store.historyRunView()?.entries.map(({ id }) => id)).toEqual([runB]);
  });

  it("keeps visible entries while refreshing and after transient failure", async () => {
    let resolveRefresh: ((value: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response([historyRun(runA)], diagnosticMarker(runB)),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

    const store = await import("./history-run-store");
    await store.syncHistoryRuns(userA);
    const refresh = store.refreshHistoryRuns(userA);
    expect(store.historyRunView()?.status).toBe("synced");
    expect(store.historyRunView()?.entries.map(({ id }) => id)).toEqual([runA]);
    expect(store.historyRunView()?.latestSubmittedDiagnostic?.id).toBe(runB);

    resolveRefresh?.(new Response(null, { status: 503 }));
    await expect(refresh).resolves.toBe(false);
    expect(store.historyRunView()?.status).toBe("degraded");
    expect(store.historyRunView()?.entries.map(({ id }) => id)).toEqual([runA]);
    expect(store.historyRunView()?.latestSubmittedDiagnostic?.id).toBe(runB);
  });

  it("does not refresh a different or malformed active owner", async () => {
    const store = await import("./history-run-store");
    store.prepareHistoryRuns(userA);

    await expect(store.refreshHistoryRuns(userB)).resolves.toBe(false);
    await expect(store.refreshHistoryRuns("invalid-owner")).resolves.toBe(
      false,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports degraded state after a failed owner request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const store = await import("./history-run-store");
    await store.syncHistoryRuns(userA);
    expect(store.historyRunView()).toEqual({
      status: "degraded",
      entries: [],
      latestSubmittedDiagnostic: null,
    });
  });
});

function response(
  runs: unknown[],
  latestSubmittedDiagnostic: unknown = null,
): Response {
  return new Response(
    JSON.stringify({ data: { runs, latestSubmittedDiagnostic } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

const runA = "a4c92799-136d-4136-bbed-2b95bded5a5b";
const runB = "ddf6c34f-4e6d-49ab-b6b4-04b2ee55f19f";

function historyRun(id: string) {
  return {
    id,
    kind: "PRACTICE",
    status: "SUBMITTED",
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: "sha256:history-run-store",
    startedAt: "2026-08-13T10:00:00.000Z",
    submittedAt: "2026-08-13T10:15:00.000Z",
    activeDurationMs: 600_000,
    taskIds: ["kb-001"],
    itemCount: 1,
    completedItemCount: 1,
    correctItemCount: 1,
    earnedPoints: null,
    maxPoints: null,
  };
}

function diagnosticMarker(id: string) {
  return {
    id,
    kind: "DIAGNOSTIC",
    submittedAt: "2026-08-13T10:15:00.000Z",
  };
}
