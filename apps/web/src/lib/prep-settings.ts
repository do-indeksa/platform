import {
  browserStorageOwnerScope,
  type BrowserStorageOwnerId,
} from "./browser-storage-owner";

export const PREP_GOAL_MIN = 1;
export const PREP_GOAL_MAX = 60;
export const PREP_EXAM_DATE_MIN = "2000-01-01";
export const PREP_EXAM_DATE_MAX = "9999-12-31";
export const PREP_SETTINGS_STORAGE_PREFIX = "do-indeksa-prep-settings-v2:";

const PREP_SETTINGS_STORAGE_VERSION = 1;
const MAX_STORAGE_CHARACTERS = 2_000;

export type PrepPreferences = {
  goalPoints: number | null;
  examDate: string | null;
};

export type CompletePrepPreferences = {
  goalPoints: number;
  examDate: string;
};

export const EMPTY_PREP_PREFERENCES: Readonly<PrepPreferences> = {
  goalPoints: null,
  examDate: null,
};

export function prepSettingsStorageKey(ownerId: BrowserStorageOwnerId): string {
  return `${PREP_SETTINGS_STORAGE_PREFIX}${browserStorageOwnerScope(ownerId)}`;
}

export function loadPrepPreferences(
  ownerId: BrowserStorageOwnerId,
): PrepPreferences | null {
  try {
    const raw = localStorage.getItem(prepSettingsStorageKey(ownerId));
    if (!raw || raw.length > MAX_STORAGE_CHARACTERS) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== PREP_SETTINGS_STORAGE_VERSION ||
      !isRecord(value.state)
    ) {
      return null;
    }
    const parsed = parsePrepPreferences(value.state);
    if (
      value.state.goalPoints !== parsed.goalPoints ||
      value.state.examDate !== parsed.examDate
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePrepPreferences(
  ownerId: BrowserStorageOwnerId,
  preferences: PrepPreferences,
): boolean {
  try {
    const parsed = parsePrepPreferences(preferences);
    if (
      preferences.goalPoints !== parsed.goalPoints ||
      preferences.examDate !== parsed.examDate
    ) {
      return false;
    }
    const serialized = JSON.stringify({
      version: PREP_SETTINGS_STORAGE_VERSION,
      state: parsed,
    });
    if (serialized.length > MAX_STORAGE_CHARACTERS) return false;
    localStorage.setItem(prepSettingsStorageKey(ownerId), serialized);
    return true;
  } catch {
    return false;
  }
}

export function parsePrepPreferences(value: unknown): PrepPreferences {
  if (!isRecord(value)) return { ...EMPTY_PREP_PREFERENCES };
  const goalPoints =
    typeof value.goalPoints === "number" &&
    Number.isInteger(value.goalPoints) &&
    value.goalPoints >= PREP_GOAL_MIN &&
    value.goalPoints <= PREP_GOAL_MAX
      ? value.goalPoints
      : null;
  const examDate =
    typeof value.examDate === "string" && isCalendarDate(value.examDate)
      ? value.examDate
      : null;
  return { goalPoints, examDate };
}

export function completePrepPreferences(
  value: PrepPreferences,
): CompletePrepPreferences | null {
  const parsed = parsePrepPreferences(value);
  return parsed.goalPoints === null ||
    parsed.examDate === null ||
    value.goalPoints !== parsed.goalPoints ||
    value.examDate !== parsed.examDate
    ? null
    : { goalPoints: parsed.goalPoints, examDate: parsed.examDate };
}

function isCalendarDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < PREP_EXAM_DATE_MIN ||
    value > PREP_EXAM_DATE_MAX
  ) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
