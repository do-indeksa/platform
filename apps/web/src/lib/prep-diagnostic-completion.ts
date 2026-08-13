import type { DiagnosticPhase } from "./diagnostic-store";
import type { SubmittedRunSummary } from "./history-run-summary";

export type PrepDiagnosticCompletion = {
  completed: boolean;
  completedToday: boolean;
};

export function prepDiagnosticCompletion({
  localPhase,
  localCompletedAt,
  latestSubmittedDiagnostic,
  dayStartMs,
  dayEndMs,
}: {
  localPhase: DiagnosticPhase | null;
  localCompletedAt: number | null;
  latestSubmittedDiagnostic: SubmittedRunSummary | null;
  dayStartMs: number;
  dayEndMs: number;
}): PrepDiagnosticCompletion {
  const completionTimes: number[] = [];
  if (
    localPhase === "done" &&
    localCompletedAt !== null &&
    Number.isFinite(localCompletedAt)
  ) {
    completionTimes.push(localCompletedAt);
  }
  if (latestSubmittedDiagnostic?.kind === "DIAGNOSTIC") {
    const submittedAt = Date.parse(latestSubmittedDiagnostic.submittedAt);
    if (Number.isFinite(submittedAt)) completionTimes.push(submittedAt);
  }
  return {
    completed: completionTimes.length > 0,
    completedToday: completionTimes.some(
      (completedAt) => completedAt >= dayStartMs && completedAt < dayEndMs,
    ),
  };
}
