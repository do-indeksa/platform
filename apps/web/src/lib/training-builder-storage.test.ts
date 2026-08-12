import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadTrainingBuilderDraft,
  saveTrainingBuilderDraft,
  trainingBuilderStorageKey,
} from "./training-builder-storage";
import {
  createDefaultTrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "./training-builder";

const positions: TrainingBuilderPosition[] = [
  { number: 1, topicSlugs: ["complex"], availableCount: 3 },
  { number: 4, topicSlugs: ["logs"], availableCount: 3 },
];
const blueprintVersion = "2026.1";
const USER_A = "39ec4650-762d-437f-9917-c31ab167cb99";
const USER_B = "73ce6fba-0219-4549-a521-054085c09e5b";
const LEGACY_STORAGE_KEY = "do-indeksa-training-builder";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("training builder storage", () => {
  it("round-trips only a validated, versioned draft", () => {
    const map = storage();
    const draft = createDefaultTrainingBuilderDraft(
      positions,
      blueprintVersion,
    );

    expect(
      saveTrainingBuilderDraft(USER_A, draft, positions, blueprintVersion),
    ).toBe(true);
    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toEqual(draft);
    expect(map.has(trainingBuilderStorageKey(USER_A))).toBe(true);
    expect(
      loadTrainingBuilderDraft(USER_B, positions, blueprintVersion),
    ).toBeNull();
    expect(
      loadTrainingBuilderDraft(null, positions, blueprintVersion),
    ).toBeNull();
  });

  it("ignores corrupt, oversized, and stale persisted input", () => {
    const map = storage();
    const key = trainingBuilderStorageKey(USER_A);
    map.set(key, "not-json");
    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toBeNull();

    map.set(key, "x".repeat(8_001));
    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toBeNull();

    const stale = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      blueprintVersion: "2025.1",
    };
    map.set(key, JSON.stringify(stale));
    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toBeNull();
  });

  it("does not claim the unowned legacy draft for a user or guest", () => {
    const legacy = createDefaultTrainingBuilderDraft(
      positions,
      blueprintVersion,
    );
    const map = storage();
    map.set(LEGACY_STORAGE_KEY, JSON.stringify(legacy));

    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toBeNull();
    expect(
      loadTrainingBuilderDraft(null, positions, blueprintVersion),
    ).toBeNull();
    expect(map.get(LEGACY_STORAGE_KEY)).toBe(JSON.stringify(legacy));
  });

  it("reports unavailable browser storage without leaking exceptions", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }),
    });
    const draft = createDefaultTrainingBuilderDraft(
      positions,
      blueprintVersion,
    );

    expect(
      loadTrainingBuilderDraft(USER_A, positions, blueprintVersion),
    ).toBeNull();
    expect(
      saveTrainingBuilderDraft(USER_A, draft, positions, blueprintVersion),
    ).toBe(false);
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
