import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./training-builder-draft-client", () => {
  class TrainingBuilderDraftGraphQLError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
      this.name = "TrainingBuilderDraftGraphQLError";
    }
  }
  return {
    fetchServerTrainingBuilderDraft: mocks.fetch,
    saveServerTrainingBuilderDraft: mocks.save,
    TrainingBuilderDraftGraphQLError,
  };
});

import { TrainingBuilderDraftGraphQLError } from "./training-builder-draft-client";
import {
  hydrateTrainingBuilderDraft,
  saveTrainingBuilderDraftForOwner,
} from "./training-builder-draft-sync";
import {
  loadTrainingBuilderDraft,
  saveTrainingBuilderDraft,
  trainingBuilderStorageKey,
} from "./training-builder-storage";
import {
  createDefaultTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "./training-builder";

const USER = "39ec4650-762d-437f-9917-c31ab167cb99";
const blueprintVersion = "2026.1";
const positions: TrainingBuilderPosition[] = [
  { number: 1, topicSlugs: ["complex"], availableCount: 3 },
  { number: 4, topicSlugs: ["logs"], availableCount: 3 },
];
const LOCAL: TrainingBuilderDraft = {
  ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
  quantities: { 1: 2, 4: 2 },
  difficulty: "advanced",
  onlyNew: false,
};
const REMOTE = {
  draft: {
    ...LOCAL,
    quantities: { 1: 1, 4: 2 },
    difficulty: "foundation" as const,
  },
  serverVersion: 4,
};

let localStorageMap: Map<string, string>;

beforeEach(() => {
  localStorageMap = storage();
  mocks.fetch.mockReset();
  mocks.save.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("training builder draft synchronization", () => {
  it("keeps guest drafts local without contacting GraphQL", async () => {
    expect(
      saveTrainingBuilderDraft(null, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    await expect(
      hydrateTrainingBuilderDraft(null, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: LOCAL,
      serverVersion: null,
      status: "guest",
      source: "saved",
    });
    const changed = { ...LOCAL, difficulty: "balanced" as const };
    await expect(
      saveTrainingBuilderDraftForOwner(
        null,
        null,
        changed,
        positions,
        blueprintVersion,
      ),
    ).resolves.toEqual({
      status: "saved",
      state: {
        draft: changed,
        serverVersion: null,
        status: "guest",
        source: "saved",
      },
    });
    expect(loadTrainingBuilderDraft(null, positions, blueprintVersion)).toEqual(
      changed,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("uses the server over stale account cache and refreshes the cache", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockResolvedValue(REMOTE);

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: REMOTE.draft,
      serverVersion: REMOTE.serverVersion,
      status: "synced",
      source: "saved",
    });
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      REMOTE.draft,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("seeds an empty server once from the validated account cache", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ draft: LOCAL, serverVersion: 1 });

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: LOCAL,
      serverVersion: 1,
      status: "synced",
      source: "saved",
    });
    expect(mocks.save).toHaveBeenCalledWith(0, LOCAL, undefined);
  });

  it("reads the winner when first-write migration races another device", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockResolvedValueOnce(null).mockResolvedValueOnce(REMOTE);
    mocks.save.mockRejectedValue(
      new TrainingBuilderDraftGraphQLError("changed", "CONFLICT"),
    );

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toMatchObject({
      draft: REMOTE.draft,
      serverVersion: REMOTE.serverVersion,
      status: "synced",
    });
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      REMOTE.draft,
    );
  });

  it("keeps the local fallback when a seed acknowledgement differs", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockResolvedValue(null);
    mocks.save.mockResolvedValue(REMOTE);

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: LOCAL,
      serverVersion: null,
      status: "degraded",
      source: "saved",
    });
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      LOCAL,
    );
  });

  it("retains the local fallback when the server read is unavailable", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockRejectedValue(new Error("offline"));

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: LOCAL,
      serverVersion: null,
      status: "degraded",
      source: "saved",
    });
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      LOCAL,
    );
  });

  it("keeps an incompatible server version but does not activate stale data", async () => {
    expect(
      saveTrainingBuilderDraft(USER, LOCAL, positions, blueprintVersion),
    ).toBe(true);
    mocks.fetch.mockResolvedValue({
      draft: { ...REMOTE.draft, blueprintVersion: "2025.1" },
      serverVersion: 8,
    });

    await expect(
      hydrateTrainingBuilderDraft(USER, positions, blueprintVersion),
    ).resolves.toEqual({
      draft: createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      serverVersion: 8,
      status: "synced",
      source: "default",
    });
    expect(localStorageMap.has(trainingBuilderStorageKey(USER))).toBe(false);
  });

  it("saves against the known version and persists the acknowledgement", async () => {
    mocks.save.mockResolvedValue({ draft: LOCAL, serverVersion: 5 });

    await expect(
      saveTrainingBuilderDraftForOwner(
        USER,
        4,
        LOCAL,
        positions,
        blueprintVersion,
      ),
    ).resolves.toEqual({
      status: "saved",
      state: {
        draft: LOCAL,
        serverVersion: 5,
        status: "synced",
        source: "saved",
      },
    });
    expect(mocks.save).toHaveBeenCalledWith(4, LOCAL, undefined);
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      LOCAL,
    );
  });

  it("returns current server state after a stale write conflict", async () => {
    mocks.save.mockRejectedValue(
      new TrainingBuilderDraftGraphQLError("changed", "CONFLICT"),
    );
    mocks.fetch.mockResolvedValue(REMOTE);

    await expect(
      saveTrainingBuilderDraftForOwner(
        USER,
        3,
        LOCAL,
        positions,
        blueprintVersion,
      ),
    ).resolves.toEqual({
      status: "conflict",
      state: {
        draft: REMOTE.draft,
        serverVersion: REMOTE.serverVersion,
        status: "synced",
        source: "saved",
      },
    });
    expect(loadTrainingBuilderDraft(USER, positions, blueprintVersion)).toEqual(
      REMOTE.draft,
    );
  });

  it("does not overwrite unknown server state after degraded hydration", async () => {
    mocks.fetch.mockResolvedValue(REMOTE);

    const result = await saveTrainingBuilderDraftForOwner(
      USER,
      null,
      LOCAL,
      positions,
      blueprintVersion,
    );
    expect(result).toMatchObject({
      status: "conflict",
      state: { serverVersion: REMOTE.serverVersion },
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("accepts an idempotent read after an uncertain connection", async () => {
    mocks.fetch.mockResolvedValue({ draft: LOCAL, serverVersion: 6 });

    await expect(
      saveTrainingBuilderDraftForOwner(
        USER,
        null,
        LOCAL,
        positions,
        blueprintVersion,
      ),
    ).resolves.toMatchObject({
      status: "saved",
      state: { serverVersion: 6 },
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not replace the fallback after unavailable or mismatched writes", async () => {
    expect(
      saveTrainingBuilderDraft(USER, REMOTE.draft, positions, blueprintVersion),
    ).toBe(true);
    mocks.save
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        draft: { ...LOCAL, shuffle: false },
        serverVersion: 5,
      });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        saveTrainingBuilderDraftForOwner(
          USER,
          4,
          LOCAL,
          positions,
          blueprintVersion,
        ),
      ).resolves.toEqual({ status: "unavailable" });
      expect(
        loadTrainingBuilderDraft(USER, positions, blueprintVersion),
      ).toEqual(REMOTE.draft);
    }
  });
});

function storage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  return map;
}
