import {
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";

export type TaskSessionOwnerId = LearningRunOwnerId;

export function taskSessionStorageScope(ownerId: TaskSessionOwnerId): string {
  const parsed = parseLearningRunOwner(ownerId);
  if (parsed === undefined) throw new Error("task session owner is invalid");
  return parsed === null ? "guest" : `user:${parsed.toLowerCase()}`;
}
