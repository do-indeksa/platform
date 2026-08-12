export const MAX_ANSWER_LENGTH = 200;
export const MAX_TASK_ANSWER_PARTS = 6;
export const TASK_DRAFT_STORAGE_PREFIX = "do-indeksa-task-draft-v1:";
const MAX_TASK_ACTIVE_DURATION_MS = 12 * 60 * 60 * 1_000;

export function taskDraftStorageKey(
  taskId: string,
  practiceId: string | null,
): string {
  return `${TASK_DRAFT_STORAGE_PREFIX}${practiceId ? `${practiceId}:` : ""}${taskId}`;
}

export type TaskCheckView =
  "form" | "incorrect" | "hint" | "solution" | "correct";

export type TaskDraft = {
  answers: string[];
  view: TaskCheckView;
  attempted: boolean;
  hintsShown: number;
  solved: boolean;
  burned: boolean;
  dirty: boolean;
  activeDurationMs?: number;
};

const VIEWS = new Set<TaskCheckView>([
  "form",
  "incorrect",
  "hint",
  "solution",
  "correct",
]);

export function createTaskDraft(partCount: number): TaskDraft {
  return {
    answers: Array<string>(partCount).fill(""),
    view: "form",
    attempted: false,
    hintsShown: 0,
    solved: false,
    burned: false,
    dirty: false,
  };
}

export function parseTaskDraft(
  raw: string | null,
  partCount: number,
  maxHints: number,
): TaskDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return null;
    if (
      !Array.isArray(value.answers) ||
      value.answers.length !== partCount ||
      !value.answers.every(
        (answer) =>
          typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
      ) ||
      typeof value.view !== "string" ||
      !VIEWS.has(value.view as TaskCheckView) ||
      typeof value.attempted !== "boolean" ||
      !Number.isInteger(value.hintsShown) ||
      (value.hintsShown as number) < 0 ||
      (value.hintsShown as number) > Math.min(maxHints, 2) ||
      typeof value.solved !== "boolean" ||
      typeof value.burned !== "boolean" ||
      typeof value.dirty !== "boolean" ||
      (value.activeDurationMs !== undefined &&
        (!Number.isInteger(value.activeDurationMs) ||
          (value.activeDurationMs as number) < 0 ||
          (value.activeDurationMs as number) > MAX_TASK_ACTIVE_DURATION_MS))
    ) {
      return null;
    }

    const draft = value as TaskDraft;
    if (draft.solved && draft.burned) return null;
    if (draft.view === "correct" && !draft.solved) return null;
    if (draft.view === "incorrect" && !draft.attempted) return null;
    if (draft.view === "hint" && draft.hintsShown === 0) return null;
    if (draft.view === "solution" && !draft.solved && !draft.burned)
      return null;
    return draft;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
