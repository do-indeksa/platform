import { describe, expect, it, vi } from "vitest";
import { PrepPreferencesGraphQLError } from "./prep-preferences-client";
import {
  hydrateSignedInPrepPreferences,
  syncSignedInPrepPreferencesWrite,
  type PrepPreferencesRemote,
} from "./prep-preferences-sync";

const local = { goalPoints: 42, examDate: "2027-06-28" };
const server = {
  goalPoints: 50,
  examDate: "2028-07-01",
  version: 3,
  updatedAt: "2026-08-16T12:00:00Z",
};

describe("signed-in prep preference hydration", () => {
  it("uses a successful server read instead of stale local data", async () => {
    const remote = remoteWith({ fetch: vi.fn(async () => server) });

    await expect(
      hydrateSignedInPrepPreferences(local, remote),
    ).resolves.toEqual({
      preferences: { goalPoints: 50, examDate: "2028-07-01" },
      version: 3,
      authoritative: true,
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("seeds an empty server once from a complete account cache", async () => {
    const remote = remoteWith({
      fetch: vi.fn(async () => null),
      save: vi.fn(async (input) => ({
        ...input,
        version: 1,
        updatedAt: "2026-08-16T12:00:00Z",
      })),
    });

    await expect(
      hydrateSignedInPrepPreferences(local, remote),
    ).resolves.toEqual({
      preferences: local,
      version: 1,
      authoritative: true,
    });
    expect(remote.save).toHaveBeenCalledOnce();
    expect(remote.save).toHaveBeenCalledWith(
      { expectedVersion: 0, ...local },
      undefined,
    );
  });

  it("does not seed incomplete cache data after an authoritative empty read", async () => {
    const remote = remoteWith({ fetch: vi.fn(async () => null) });

    await expect(
      hydrateSignedInPrepPreferences(
        { goalPoints: 42, examDate: null },
        remote,
      ),
    ).resolves.toEqual({
      preferences: { goalPoints: null, examDate: null },
      version: 0,
      authoritative: true,
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("keeps validated local fallback when the read is transiently unavailable", async () => {
    const remote = remoteWith({
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
    });

    await expect(
      hydrateSignedInPrepPreferences(local, remote),
    ).resolves.toEqual({
      preferences: local,
      version: null,
      authoritative: false,
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("re-reads the winner when first-record seeding conflicts", async () => {
    const fetch = vi
      .fn<PrepPreferencesRemote["fetch"]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(server);
    const remote = remoteWith({
      fetch,
      save: vi.fn(async () => {
        throw new PrepPreferencesGraphQLError("conflict", "CONFLICT");
      }),
    });

    await expect(
      hydrateSignedInPrepPreferences(local, remote),
    ).resolves.toEqual({
      preferences: { goalPoints: 50, examDate: "2028-07-01" },
      version: 3,
      authoritative: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("signed-in prep preference writes", () => {
  it("writes against a known version and returns the canonical result", async () => {
    const remote = remoteWith({
      save: vi.fn(async (input) => ({
        ...input,
        version: 4,
        updatedAt: "2026-08-16T12:01:00Z",
      })),
    });

    await expect(
      syncSignedInPrepPreferencesWrite(local, 3, remote),
    ).resolves.toEqual({
      preferences: local,
      version: 4,
      authoritative: true,
    });
    expect(remote.fetch).not.toHaveBeenCalled();
    expect(remote.save).toHaveBeenCalledWith(
      { expectedVersion: 3, ...local },
      undefined,
    );
  });

  it("refreshes an unknown version before an explicit degraded-mode write", async () => {
    const remote = remoteWith({
      fetch: vi.fn(async () => server),
      save: vi.fn(async (input) => ({
        ...input,
        version: 4,
        updatedAt: "2026-08-16T12:01:00Z",
      })),
    });

    await syncSignedInPrepPreferencesWrite(local, null, remote);
    expect(remote.save).toHaveBeenCalledWith(
      { expectedVersion: 3, ...local },
      undefined,
    );
  });

  it("accepts the server winner after a stale write conflict", async () => {
    const remote = remoteWith({
      fetch: vi.fn(async () => server),
      save: vi.fn(async () => {
        throw new PrepPreferencesGraphQLError("conflict", "CONFLICT");
      }),
    });

    await expect(
      syncSignedInPrepPreferencesWrite(local, 2, remote),
    ).resolves.toEqual({
      preferences: { goalPoints: 50, examDate: "2028-07-01" },
      version: 3,
      authoritative: true,
    });
  });

  it("retains the explicit local write when the transport fails", async () => {
    const remote = remoteWith({
      save: vi.fn(async () => {
        throw new Error("offline");
      }),
    });

    await expect(
      syncSignedInPrepPreferencesWrite(local, 3, remote),
    ).resolves.toEqual({
      preferences: local,
      version: null,
      authoritative: false,
    });
  });
});

function remoteWith(
  overrides: Partial<PrepPreferencesRemote>,
): PrepPreferencesRemote {
  return {
    fetch: vi.fn(async () => null),
    save: vi.fn(async () => {
      throw new Error("unexpected save");
    }),
    ...overrides,
  };
}
