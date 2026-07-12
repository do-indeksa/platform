import type { components } from "@/lib/api/schema";

export type Attempt = components["schemas"]["Attempt"];
export type NewAttempt = components["schemas"]["NewAttempt"];
export type AttemptSource = Attempt["source"];

export const MASTERY_WINDOW = 5;
export const LEVEL_MIN_ATTEMPTS = 3;

export type SlotMastery = {
  correct: number;
  total: number;
  ratio: number;
};

export function slotMastery(
  attempts: Attempt[],
  slot: number,
): SlotMastery | null {
  const recent = attempts
    .filter((attempt) => attempt.slot === slot)
    .slice(-MASTERY_WINDOW);
  if (recent.length === 0) return null;
  const correct = recent.filter((attempt) => attempt.correct).length;
  return { correct, total: recent.length, ratio: correct / recent.length };
}

export type MasteryLevel = "weak" | "medium" | "strong";

export function masteryLevel(mastery: SlotMastery): MasteryLevel | null {
  if (mastery.total < LEVEL_MIN_ATTEMPTS) return null;
  if (mastery.ratio >= 0.8) return "strong";
  if (mastery.ratio >= 0.5) return "medium";
  return "weak";
}
