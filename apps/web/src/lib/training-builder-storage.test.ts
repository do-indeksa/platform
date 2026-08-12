import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadTrainingBuilderDraft,
  saveTrainingBuilderDraft,
  TRAINING_BUILDER_STORAGE_KEY,
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

    expect(saveTrainingBuilderDraft(draft, positions, blueprintVersion)).toBe(
      true,
    );
    expect(loadTrainingBuilderDraft(positions, blueprintVersion)).toEqual(
      draft,
    );
    expect(map.has(TRAINING_BUILDER_STORAGE_KEY)).toBe(true);
  });

  it("ignores corrupt, oversized, and stale persisted input", () => {
    const map = storage("not-json");
    expect(loadTrainingBuilderDraft(positions, blueprintVersion)).toBeNull();

    map.set(TRAINING_BUILDER_STORAGE_KEY, "x".repeat(8_001));
    expect(loadTrainingBuilderDraft(positions, blueprintVersion)).toBeNull();

    const stale = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      blueprintVersion: "2025.1",
    };
    map.set(TRAINING_BUILDER_STORAGE_KEY, JSON.stringify(stale));
    expect(loadTrainingBuilderDraft(positions, blueprintVersion)).toBeNull();
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

    expect(loadTrainingBuilderDraft(positions, blueprintVersion)).toBeNull();
    expect(saveTrainingBuilderDraft(draft, positions, blueprintVersion)).toBe(
      false,
    );
  });
});

function storage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(TRAINING_BUILDER_STORAGE_KEY, initial);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  });
  return map;
}
