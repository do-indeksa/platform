import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPrepPreferences,
  parsePrepPreferences,
  prepSettingsStorageKey,
  savePrepPreferences,
} from "./prep-settings";

const USER_A = "39ec4650-762d-437f-9917-c31ab167cb99";
const USER_B = "73ce6fba-0219-4549-a521-054085c09e5b";
const LEGACY_STORAGE_KEY = "do-indeksa-prep-settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsePrepPreferences", () => {
  it("accepts a valid score goal and calendar date", () => {
    expect(
      parsePrepPreferences({ goalPoints: 42, examDate: "2027-06-28" }),
    ).toEqual({ goalPoints: 42, examDate: "2027-06-28" });
  });

  it("drops malformed, out-of-range and impossible values", () => {
    expect(
      parsePrepPreferences({ goalPoints: 61, examDate: "2027-02-30" }),
    ).toEqual({ goalPoints: null, examDate: null });
    expect(parsePrepPreferences("not-an-object")).toEqual({
      goalPoints: null,
      examDate: null,
    });
  });
});

describe("prep preferences storage", () => {
  it("round-trips preferences only inside the selected owner scope", () => {
    const map = storage();
    const preferences = { goalPoints: 42, examDate: "2027-06-28" };

    expect(savePrepPreferences(USER_A, preferences)).toBe(true);
    expect(loadPrepPreferences(USER_A)).toEqual(preferences);
    expect(loadPrepPreferences(USER_B)).toBeNull();
    expect(loadPrepPreferences(null)).toBeNull();
    expect(map.has(prepSettingsStorageKey(USER_A))).toBe(true);
  });

  it("does not claim the unowned legacy preferences", () => {
    const map = storage();
    const legacy = JSON.stringify({
      version: 1,
      state: { goalPoints: 42, examDate: "2027-06-28" },
    });
    map.set(LEGACY_STORAGE_KEY, legacy);

    expect(loadPrepPreferences(USER_A)).toBeNull();
    expect(loadPrepPreferences(null)).toBeNull();
    expect(map.get(LEGACY_STORAGE_KEY)).toBe(legacy);
  });

  it("rejects malformed, oversized, and invalid persisted envelopes", () => {
    const map = storage();
    const key = prepSettingsStorageKey(USER_A);
    map.set(key, "not-json");
    expect(loadPrepPreferences(USER_A)).toBeNull();

    map.set(key, "x".repeat(2_001));
    expect(loadPrepPreferences(USER_A)).toBeNull();

    map.set(
      key,
      JSON.stringify({
        version: 1,
        state: { goalPoints: 61, examDate: "2027-02-30" },
      }),
    );
    expect(loadPrepPreferences(USER_A)).toBeNull();
  });

  it("contains unavailable browser storage without leaking exceptions", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }),
    });

    expect(loadPrepPreferences(USER_A)).toBeNull();
    expect(
      savePrepPreferences(USER_A, {
        goalPoints: 42,
        examDate: "2027-06-28",
      }),
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
