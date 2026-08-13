import {
  parseTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "./training-builder";
import {
  browserStorageOwnerScope,
  type BrowserStorageOwnerId,
} from "./browser-storage-owner";

export const TRAINING_BUILDER_STORAGE_PREFIX =
  "do-indeksa-training-builder-v2:";
const MAX_DRAFT_CHARACTERS = 8_000;

export function trainingBuilderStorageKey(
  ownerId: BrowserStorageOwnerId,
): string {
  return `${TRAINING_BUILDER_STORAGE_PREFIX}${browserStorageOwnerScope(ownerId)}`;
}

export function loadTrainingBuilderDraft(
  ownerId: BrowserStorageOwnerId,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): TrainingBuilderDraft | null {
  try {
    const raw = localStorage.getItem(trainingBuilderStorageKey(ownerId));
    if (!raw || raw.length > MAX_DRAFT_CHARACTERS) return null;
    return parseTrainingBuilderDraft(
      JSON.parse(raw),
      positions,
      blueprintVersion,
    );
  } catch {
    return null;
  }
}

export function saveTrainingBuilderDraft(
  ownerId: BrowserStorageOwnerId,
  draft: TrainingBuilderDraft,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): boolean {
  try {
    const valid = parseTrainingBuilderDraft(draft, positions, blueprintVersion);
    if (!valid) return false;
    const serialized = JSON.stringify(valid);
    if (serialized.length > MAX_DRAFT_CHARACTERS) return false;
    localStorage.setItem(trainingBuilderStorageKey(ownerId), serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearTrainingBuilderDraft(
  ownerId: BrowserStorageOwnerId,
): boolean {
  try {
    localStorage.removeItem(trainingBuilderStorageKey(ownerId));
    return true;
  } catch {
    return false;
  }
}
