import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAttempt } from "./attempt-journal";
import { loadStoredAttempts, writeStoredAttempts } from "./attempt-storage";

const STORAGE_KEY = "do-indeksa-attempts";

function storage(raw: string | null = null) {
  const setItem = vi.fn();
  const removeItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => raw),
    setItem,
    removeItem,
  });
  return { setItem, removeItem };
}

function legacyAttempt(): StoredAttempt {
  return {
    taskId: "kb-001",
    slot: 1,
    correct: true,
    source: "practice",
    helpLevel: 0,
    at: "2026-07-12T10:00:00.000Z",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadStoredAttempts", () => {
  it("migrates valid v1 rows and filters corrupt rows", () => {
    storage(
      JSON.stringify({
        version: 1,
        attempts: [
          legacyAttempt(),
          { ...legacyAttempt(), taskId: "" },
          "garbage",
        ],
      }),
    );

    expect(loadStoredAttempts()).toEqual([legacyAttempt()]);
  });

  it("rejects an oversized raw journal before parsing", () => {
    storage("x".repeat(4_000_001));

    expect(loadStoredAttempts()).toEqual([]);
  });
});

describe("writeStoredAttempts", () => {
  it("writes the versioned envelope and removes an empty journal", () => {
    const local = storage();

    expect(writeStoredAttempts([legacyAttempt()])).toBe(true);
    expect(local.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ version: 2, attempts: [legacyAttempt()] }),
    );
    expect(writeStoredAttempts([])).toBe(true);
    expect(local.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("refuses writes beyond the bounded storage envelope", () => {
    const local = storage();
    const oversized = {
      ...legacyAttempt(),
      padding: "x".repeat(4_000_000),
    } as unknown as StoredAttempt;

    expect(writeStoredAttempts([oversized])).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("refuses more entries than the bounded journal permits", () => {
    const local = storage();

    expect(
      writeStoredAttempts(Array.from({ length: 1_001 }, legacyAttempt)),
    ).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("reports browser storage failures", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }),
      removeItem: vi.fn(),
    });

    expect(writeStoredAttempts([legacyAttempt()])).toBe(false);
  });
});
