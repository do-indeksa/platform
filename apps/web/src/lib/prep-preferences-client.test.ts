import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchServerPrepPreferences,
  parseServerPrepPreferences,
  PrepPreferencesGraphQLError,
  saveServerPrepPreferences,
} from "./prep-preferences-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prep preferences GraphQL client", () => {
  it("parses only complete preferences with a safe positive version", () => {
    expect(
      parseServerPrepPreferences({
        goalPoints: 42,
        examDate: "2028-02-29",
        version: 3,
      }),
    ).toEqual({ goalPoints: 42, examDate: "2028-02-29", version: 3 });
    for (const value of [
      null,
      { goalPoints: 61, examDate: "2028-02-29", version: 1 },
      { goalPoints: 42, examDate: "2027-02-29", version: 1 },
      { goalPoints: 42, examDate: "2028-02-29", version: 0 },
      { goalPoints: 42, examDate: "2028-02-29", version: 1.5 },
      {
        goalPoints: 42,
        examDate: "2028-02-29",
        version: Number.MAX_SAFE_INTEGER + 1,
      },
    ]) {
      expect(parseServerPrepPreferences(value)).toBeNull();
    }
  });

  it("reads nullable server state and sends an exact versioned mutation", async () => {
    const calls: GraphQLCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const call = JSON.parse(init?.body as string) as GraphQLCall;
        calls.push(call);
        if (call.operationName === "PrepPreferences") {
          return Response.json({ data: { prepPreferences: null } });
        }
        return Response.json({
          data: {
            savePrepPreferences: {
              goalPoints: 50,
              examDate: "2029-06-28",
              version: 8,
            },
          },
        });
      }),
    );

    await expect(fetchServerPrepPreferences()).resolves.toBeNull();
    await expect(
      saveServerPrepPreferences(7, {
        goalPoints: 50,
        examDate: "2029-06-28",
      }),
    ).resolves.toEqual({
      goalPoints: 50,
      examDate: "2029-06-28",
      version: 8,
    });
    expect(calls.map((call) => call.operationName)).toEqual([
      "PrepPreferences",
      "SavePrepPreferences",
    ]);
    expect(calls[1]?.variables).toEqual({
      input: {
        expectedVersion: 7,
        goalPoints: 50,
        examDate: "2029-06-28",
      },
    });
  });

  it("preserves a coded conflict and rejects malformed envelopes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: null,
        errors: [{ message: "changed", extensions: { code: "CONFLICT" } }],
      }),
    );
    const conflict = await saveServerPrepPreferences(1, {
      goalPoints: 42,
      examDate: "2028-02-29",
    }).catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(PrepPreferencesGraphQLError);
    expect(conflict).toMatchObject({ code: "CONFLICT" });

    for (const payload of [
      { data: { prepPreferences: null }, errors: { message: "bad" } },
      { data: {} },
      { data: { prepPreferences: { goalPoints: 42 } } },
    ]) {
      fetchMock.mockResolvedValueOnce(Response.json(payload));
      await expect(fetchServerPrepPreferences()).rejects.toThrow();
    }
  });

  it("rejects non-success HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(fetchServerPrepPreferences()).rejects.toThrow("status 503");
  });
});

type GraphQLCall = {
  operationName: string;
  variables: Record<string, unknown>;
};
