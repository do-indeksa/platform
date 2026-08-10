import type { Attempt } from "./knowledge";

export const DAILY_TASK_TIME_ZONE = "Europe/Belgrade";

const belgradeDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DAILY_TASK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dailyTaskDayKey(date: Date): string {
  const parts = Object.fromEntries(
    belgradeDayFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function selectDailyTask<T extends { id: string }>(
  tasks: readonly T[],
  date: Date,
): T | null {
  if (tasks.length === 0) return null;
  const ordered = tasks.toSorted((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return ordered[hashDayKey(dailyTaskDayKey(date)) % ordered.length];
}

export function isDailyTaskComplete(
  attempts: readonly Attempt[],
  taskId: string,
  date: Date,
): boolean {
  const today = dailyTaskDayKey(date);
  return attempts.some(
    (attempt) =>
      attempt.correct &&
      attempt.taskId === taskId &&
      safeDayKey(attempt.at) === today,
  );
}

export function studyDayStreak(
  attempts: readonly Attempt[],
  date: Date,
): number {
  const activeDays = new Set(
    attempts
      .filter((attempt) => attempt.correct)
      .map((attempt) => safeDayKey(attempt.at))
      .filter((day): day is string => day !== null),
  );
  const today = dailyTaskDayKey(date);
  let cursor = activeDays.has(today) ? today : previousDayKey(today);
  let streak = 0;

  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

function safeDayKey(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : dailyTaskDayKey(date);
}

function previousDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function hashDayKey(dayKey: string): number {
  let hash = 2_166_136_261;
  for (const character of dayKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
