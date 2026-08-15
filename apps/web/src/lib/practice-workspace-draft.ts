import type { PracticeWorkspaceSnapshot } from "./practice-workspace-runtime";
import type { TaskDraft } from "./task-draft";

export function practiceWorkspaceDraftMatches(
  draft: TaskDraft | null,
  answers: readonly string[],
  hintsShown: number,
): boolean {
  if (draft === null) {
    return hintsShown === 0 && answers.every((answer) => answer.length === 0);
  }
  return draft.hintsShown === hintsShown && sameAnswers(draft.answers, answers);
}

export function taskDraftFromPracticeWorkspace(
  snapshot: PracticeWorkspaceSnapshot,
  maxHints: number,
): TaskDraft | null {
  const latest = snapshot.attempts.at(-1);
  const draft = snapshot.draft;
  if (latest === undefined && draft === null) return null;
  const answers = [...(draft?.answers ?? latest?.answers ?? [])];
  const helpLevel = Math.max(latest?.helpLevel ?? 0, draft?.helpLevel ?? 0);
  const hintsShown = Math.min(helpLevel, maxHints, 2);

  if (latest?.outcome === "correct") {
    return terminalDraft(answers, hintsShown, true);
  }
  if (latest?.outcome === "skipped") {
    return terminalDraft(answers, hintsShown, false);
  }
  if (latest?.outcome === "incorrect") {
    const answersChanged =
      draft !== null && !sameAnswers(draft.answers, latest.answers);
    return {
      answers,
      view: answersChanged
        ? "form"
        : (draft?.helpLevel ?? 0) > latest.helpLevel
          ? "hint"
          : "incorrect",
      attempted: true,
      hintsShown,
      solved: false,
      burned: false,
      dirty: answersChanged,
    };
  }
  return {
    answers,
    view: "form",
    attempted: false,
    hintsShown,
    solved: false,
    burned: false,
    dirty: answers.some((answer) => answer.length > 0),
  };
}

function terminalDraft(
  answers: string[],
  hintsShown: number,
  solved: boolean,
): TaskDraft {
  return {
    answers,
    view: solved ? "correct" : "solution",
    attempted: true,
    hintsShown,
    solved,
    burned: !solved,
    dirty: false,
  };
}

function sameAnswers(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((answer, index) => answer === right[index])
  );
}
