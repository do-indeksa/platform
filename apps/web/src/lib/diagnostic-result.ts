import type { DiagnosticOutcome } from "./diagnostic-store";

type PracticeCandidate = {
  practiceTask: { id: string; topic: string } | null;
};

const OUTCOME_PRIORITY: DiagnosticOutcome[] = [
  "incorrect",
  "skipped",
  "correct",
];

export function diagnosticPracticeSet(
  tasks: readonly PracticeCandidate[],
  outcomes: readonly (DiagnosticOutcome | null)[],
  limit = 3,
): { id: string; topic: string }[] {
  const selected: { id: string; topic: string }[] = [];
  const seen = new Set<string>();
  for (const outcome of OUTCOME_PRIORITY) {
    tasks.forEach((task, index) => {
      const candidate = task.practiceTask;
      if (
        outcomes[index] !== outcome ||
        !candidate ||
        seen.has(candidate.id) ||
        selected.length >= limit
      ) {
        return;
      }
      seen.add(candidate.id);
      selected.push(candidate);
    });
  }
  return selected;
}
