import type { DiagnosticPhase } from "./diagnostic-store";
import type { LatestSubmittedDiagnosticRun } from "./history-run-sync";

type LocalDiagnosticCompletion = {
  phase: DiagnosticPhase | null;
  completedAt: readonly (number | null)[];
};

export function diagnosticBaselineCompletedAt(
  local: LocalDiagnosticCompletion,
  remote: LatestSubmittedDiagnosticRun | null,
): number | null {
  const localCompletedAt =
    local.phase === "done" ? validTime(local.completedAt.at(-1)) : null;
  const remoteCompletedAt = remote
    ? validTime(Date.parse(remote.submittedAt))
    : null;
  if (localCompletedAt === null) return remoteCompletedAt;
  if (remoteCompletedAt === null) return localCompletedAt;
  return Math.max(localCompletedAt, remoteCompletedAt);
}

function validTime(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
