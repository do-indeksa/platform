"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const PREP_GOAL_MIN = 1;
export const PREP_GOAL_MAX = 60;

export type PrepPreferences = {
  goalPoints: number | null;
  examDate: string | null;
};

type PrepSettingsState = PrepPreferences & {
  setPreferences: (preferences: PrepPreferences) => void;
};

const emptyPreferences: PrepPreferences = {
  goalPoints: null,
  examDate: null,
};

export const usePrepSettings = create<PrepSettingsState>()(
  persist(
    (set) => ({
      ...emptyPreferences,
      setPreferences: (preferences) => set(parsePrepPreferences(preferences)),
    }),
    {
      name: "do-indeksa-prep-settings",
      version: 1,
      partialize: ({ goalPoints, examDate }) => ({ goalPoints, examDate }),
      merge: (persisted, current) => ({
        ...current,
        ...parsePrepPreferences(persisted),
      }),
    },
  ),
);

export function parsePrepPreferences(value: unknown): PrepPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...emptyPreferences };
  }
  const preferences = value as Record<string, unknown>;
  const goalPoints =
    typeof preferences.goalPoints === "number" &&
    Number.isInteger(preferences.goalPoints) &&
    preferences.goalPoints >= PREP_GOAL_MIN &&
    preferences.goalPoints <= PREP_GOAL_MAX
      ? preferences.goalPoints
      : null;
  const examDate =
    typeof preferences.examDate === "string" &&
    isCalendarDate(preferences.examDate)
      ? preferences.examDate
      : null;
  return { goalPoints, examDate };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
