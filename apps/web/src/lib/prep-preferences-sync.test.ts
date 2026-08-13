import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./prep-preferences-client", () => {
  class PrepPreferencesGraphQLError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
      this.name = "PrepPreferencesGraphQLError";
    }
  }
  return {
    fetchServerPrepPreferences: mocks.fetch,
    saveServerPrepPreferences: mocks.save,
    PrepPreferencesGraphQLError,
  };
});

import { PrepPreferencesGraphQLError } from "./prep-preferences-client";
import {
  hydratePrepPreferences,
  savePrepPreferencesForOwner,
} from "./prep-preferences-sync";
import { loadPrepPreferences, savePrepPreferences } from "./prep-settings";

const USER = "39ec4650-762d-437f-9917-c31ab167cb99";
const LOCAL = { goalPoints: 42, examDate: "2028-02-29" };
const REMOTE = { goalPoints: 50, examDate: "2029-06-28", version: 4 };

beforeEach(() => {
  storage();
  mocks.fetch.mockReset();
  mocks.save.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prep preference synchronization", () => {
  it("keeps guest preferences local without contacting GraphQL", async () => {
    expect(savePrepPreferences(null, LOCAL)).toBe(true);
    await expect(hydratePrepPreferences(null)).resolves.toEqual({
      preferences: LOCAL,
      serverVersion: null,
      status: "guest",
    });
    await expect(
      savePrepPreferencesForOwner(null, null, {
        goalPoints: 35,
        examDate: "2030-07-01",
      }),
    ).resolves.toMatchObject({
      status: "saved",
      state: { status: "guest", serverVersion: null },
    });
    expect(loadPrepPreferences(null)).toEqual({
      goalPoints: 35,
      examDate: "2030-07-01",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("uses the server over stale account cache and refreshes the cache", async () => {
    expect(savePrepPreferences(USER, LOCAL)).toBe(true);
    mocks.fetch.mockResolvedValue(REMOTE);

    await expect(hydratePrepPreferences(USER)).resolves.toEqual({
      preferences: {
        goalPoints: REMOTE.goalPoints,
        examDate: REMOTE.examDate,
      },
      serverVersion: REMOTE.version,
      status: "synced",
    });
    expect(loadPrepPreferences(USER)).toEqual({
      goalPoints: REMOTE.goalPoints,
      examDate: REMOTE.examDate,
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("seeds an empty server once from the validated account cache", async () => {
    expect(savePrepPreferences(USER, LOCAL)).toBe(true);
    mocks.fetch.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ ...LOCAL, version: 1 });

    await expect(hydratePrepPreferences(USER)).resolves.toEqual({
      preferences: LOCAL,
      serverVersion: 1,
      status: "synced",
    });
    expect(mocks.save).toHaveBeenCalledWith(0, LOCAL, undefined);
  });

  it("reads the winner when first-write migration races another device", async () => {
    expect(savePrepPreferences(USER, LOCAL)).toBe(true);
    mocks.fetch.mockResolvedValueOnce(null).mockResolvedValueOnce(REMOTE);
    mocks.save.mockRejectedValue(
      new PrepPreferencesGraphQLError("changed", "CONFLICT"),
    );

    await expect(hydratePrepPreferences(USER)).resolves.toEqual({
      preferences: {
        goalPoints: REMOTE.goalPoints,
        examDate: REMOTE.examDate,
      },
      serverVersion: REMOTE.version,
      status: "synced",
    });
    expect(loadPrepPreferences(USER)).toEqual({
      goalPoints: REMOTE.goalPoints,
      examDate: REMOTE.examDate,
    });
  });

  it("retains the local fallback when the server read is unavailable", async () => {
    expect(savePrepPreferences(USER, LOCAL)).toBe(true);
    mocks.fetch.mockRejectedValue(new Error("offline"));

    await expect(hydratePrepPreferences(USER)).resolves.toEqual({
      preferences: LOCAL,
      serverVersion: null,
      status: "degraded",
    });
    expect(loadPrepPreferences(USER)).toEqual(LOCAL);
  });

  it("saves against the known version and persists the acknowledgement", async () => {
    mocks.save.mockResolvedValue({ ...LOCAL, version: 5 });

    await expect(savePrepPreferencesForOwner(USER, 4, LOCAL)).resolves.toEqual({
      status: "saved",
      state: {
        preferences: LOCAL,
        serverVersion: 5,
        status: "synced",
      },
    });
    expect(mocks.save).toHaveBeenCalledWith(4, LOCAL, undefined);
    expect(loadPrepPreferences(USER)).toEqual(LOCAL);
  });

  it("returns current server state after a stale write conflict", async () => {
    mocks.save.mockRejectedValue(
      new PrepPreferencesGraphQLError("changed", "CONFLICT"),
    );
    mocks.fetch.mockResolvedValue(REMOTE);

    const result = await savePrepPreferencesForOwner(USER, 3, LOCAL);
    expect(result).toEqual({
      status: "conflict",
      state: {
        preferences: {
          goalPoints: REMOTE.goalPoints,
          examDate: REMOTE.examDate,
        },
        serverVersion: REMOTE.version,
        status: "synced",
      },
    });
    expect(loadPrepPreferences(USER)).toEqual({
      goalPoints: REMOTE.goalPoints,
      examDate: REMOTE.examDate,
    });
  });

  it("does not overwrite unknown server state after degraded hydration", async () => {
    mocks.fetch.mockResolvedValue(REMOTE);

    const result = await savePrepPreferencesForOwner(USER, null, LOCAL);
    expect(result).toMatchObject({
      status: "conflict",
      state: { serverVersion: REMOTE.version },
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not replace the local fallback after an unavailable write", async () => {
    expect(savePrepPreferences(USER, LOCAL)).toBe(true);
    mocks.save.mockRejectedValue(new Error("offline"));

    await expect(
      savePrepPreferencesForOwner(USER, 4, {
        goalPoints: 35,
        examDate: "2030-07-01",
      }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(loadPrepPreferences(USER)).toEqual(LOCAL);
  });
});

function storage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  });
  return map;
}
