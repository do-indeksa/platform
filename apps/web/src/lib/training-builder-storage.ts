import {
  parseTrainingBuilderDraft,
  type TrainingBuilderDraft,
  type TrainingBuilderPosition,
} from "./training-builder";

export const TRAINING_BUILDER_STORAGE_KEY = "do-indeksa-training-builder";
const MAX_DRAFT_CHARACTERS = 8_000;

export function loadTrainingBuilderDraft(
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): TrainingBuilderDraft | null {
  try {
    const raw = localStorage.getItem(TRAINING_BUILDER_STORAGE_KEY);
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
  draft: TrainingBuilderDraft,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): boolean {
  try {
    const valid = parseTrainingBuilderDraft(draft, positions, blueprintVersion);
    if (!valid) return false;
    const serialized = JSON.stringify(valid);
    if (serialized.length > MAX_DRAFT_CHARACTERS) return false;
    localStorage.setItem(TRAINING_BUILDER_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
