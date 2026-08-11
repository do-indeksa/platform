const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LearningRunOwnerId = string | null;
export type LearningRunOwnerTransition = "keep" | "claim" | "clear";

export function parseLearningRunOwner(
  value: string | null,
): LearningRunOwnerId | undefined {
  if (value === null) return null;
  return UUID_PATTERN.test(value) ? value : undefined;
}

export function isLearningRunOwner(
  value: unknown,
): value is LearningRunOwnerId {
  return (
    value === null || (typeof value === "string" && UUID_PATTERN.test(value))
  );
}

export function learningRunOwnerTransition(
  current: LearningRunOwnerId,
  next: LearningRunOwnerId,
): LearningRunOwnerTransition {
  if (current === next) return "keep";
  return current === null && next !== null ? "claim" : "clear";
}
