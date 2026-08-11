import {
  ATTEMPT_STORAGE_VERSION,
  MAX_STORED_ATTEMPTS,
  parseStoredAttempt,
  type StoredAttempt,
} from "./attempt-journal";

const STORAGE_KEY = "do-indeksa-attempts";
const MAX_STORAGE_CHARACTERS = 4_000_000;

export function loadStoredAttempts(): StoredAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORAGE_CHARACTERS) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== ATTEMPT_STORAGE_VERSION) ||
      !Array.isArray(value.attempts) ||
      value.attempts.length > MAX_STORED_ATTEMPTS
    ) {
      return [];
    }
    return value.attempts.flatMap((attempt) => {
      const parsed = parseStoredAttempt(attempt);
      return parsed === null ? [] : [parsed];
    });
  } catch {
    return [];
  }
}

export function writeStoredAttempts(attempts: StoredAttempt[]): boolean {
  try {
    if (attempts.length > MAX_STORED_ATTEMPTS) return false;
    if (attempts.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    const serialized = JSON.stringify({
      version: ATTEMPT_STORAGE_VERSION,
      attempts,
    });
    if (serialized.length > MAX_STORAGE_CHARACTERS) return false;
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
