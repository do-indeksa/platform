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
    expect(store.historyRunView()).toEqual({ status: "guest", entries: [] });
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
    expect(store.historyRunView()).toEqual({ status: "synced", entries: [] });
  });

  it("reports degraded state after a failed owner request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const store = await import("./history-run-store");
    await store.syncHistoryRuns(userA);
    expect(store.historyRunView()).toEqual({
      status: "degraded",
      entries: [],
    });
  });
});

function response(runs: unknown[]): Response {
  return new Response(JSON.stringify({ data: { runs } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
