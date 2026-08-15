import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrepPreferencesGraphQLError,
  fetchServerPrepPreferences,
  saveServerPrepPreferences,
} from "./prep-preferences-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prep preferences GraphQL client", () => {
  it("reads a nullable owner record and sends a versioned complete write", async () => {
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        if (body.operationName === "PrepPreferences") {
          return response({ prepPreferences: null });
        }
        return response({
          savePrepPreferences: serverPreferences(2, 50, "2028-07-01"),
        });
      }),
    );

    await expect(fetchServerPrepPreferences()).resolves.toBeNull();
    await expect(
      saveServerPrepPreferences({
        expectedVersion: 1,
        goalPoints: 50,
        examDate: "2028-07-01",
      }),
    ).resolves.toEqual(serverPreferences(2, 50, "2028-07-01"));

    expect(calls).toEqual([
      {
        operationName: "PrepPreferences",
        query: expect.stringContaining("prepPreferences"),
      },
      {
        operationName: "SavePrepPreferences",
        query: expect.stringContaining("savePrepPreferences"),
        variables: {
          input: {
            expectedVersion: 1,
            goalPoints: 50,
            examDate: "2028-07-01",
          },
        },
      },
    ]);
  });

  it("strictly rejects malformed server records", async () => {
    for (const malformed of [
      { ...serverPreferences(1), goalPoints: 61 },
      { ...serverPreferences(1), examDate: "2027-02-30" },
      { ...serverPreferences(1), version: 0 },
      { ...serverPreferences(1), updatedAt: "not-a-time" },
      { goalPoints: 42, examDate: "2027-06-28", version: 1 },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response({ prepPreferences: malformed })),
      );
      await expect(fetchServerPrepPreferences()).rejects.toThrow(
        "invalid response",
      );
    }
  });

  it("preserves a coded GraphQL conflict for reconciliation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(null, [
          { message: "write conflict", extensions: { code: "CONFLICT" } },
        ]),
      ),
    );

    const error = await saveServerPrepPreferences({
      expectedVersion: 1,
      goalPoints: 42,
      examDate: "2027-06-28",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PrepPreferencesGraphQLError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  });

  it("rejects transport failures without manufacturing an empty record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(fetchServerPrepPreferences()).rejects.toThrow("status 503");
  });

  it("rejects invalid writes before making a request", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      saveServerPrepPreferences({
        expectedVersion: 0,
        goalPoints: 61,
        examDate: "2027-06-28",
      }),
    ).rejects.toThrow("input is invalid");
    expect(request).not.toHaveBeenCalled();
  });
});

type GraphQLBody = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
};

function serverPreferences(
  version = 1,
  goalPoints = 42,
  examDate = "2027-06-28",
) {
  return {
    goalPoints,
    examDate,
    version,
    updatedAt: "2026-08-16T12:00:00Z",
  };
}

function response(
  data: Record<string, unknown> | null,
  errors?: Record<string, unknown>[],
): Response {
  return new Response(JSON.stringify({ data, ...(errors ? { errors } : {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
