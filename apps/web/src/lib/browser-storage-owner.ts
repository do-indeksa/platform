import {
  parseLearningRunOwner,
  type LearningRunOwnerId,
} from "./learning-run-owner";

export type BrowserStorageOwnerId = LearningRunOwnerId;

export function browserStorageOwnerScope(
  ownerId: BrowserStorageOwnerId,
): string {
  const parsed = parseLearningRunOwner(ownerId);
  if (parsed === undefined) throw new Error("browser storage owner is invalid");
  return parsed === null ? "guest" : `user:${parsed.toLowerCase()}`;
}
