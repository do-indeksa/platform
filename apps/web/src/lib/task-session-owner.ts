import {
  browserStorageOwnerScope,
  type BrowserStorageOwnerId,
} from "./browser-storage-owner";

export type TaskSessionOwnerId = BrowserStorageOwnerId;

export function taskSessionStorageScope(ownerId: TaskSessionOwnerId): string {
  try {
    return browserStorageOwnerScope(ownerId);
  } catch {
    throw new Error("task session owner is invalid");
  }
}
