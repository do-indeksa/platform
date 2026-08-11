import type { DiagnosticCloudRun } from "./diagnostic-cloud-parser";
import type { PersistedDiagnosticState } from "./diagnostic-store";

export type DiagnosticCloudReconciliation =
  "hydrate" | "continue" | "conflict" | "ignore-completed";

export function reconcileDiagnosticCloudState(
  local: PersistedDiagnosticState,
  remote: DiagnosticCloudRun,
): DiagnosticCloudReconciliation {
  if (local.phase === null) return "hydrate";
  if (local.phase === "done") return "ignore-completed";
  const cloud = remote.runtime;
  if (
    local.runId !== cloud.runId ||
    local.runOwnerId !== cloud.runOwnerId ||
    local.startedAt !== cloud.startedAt ||
    local.checkpointVersion > cloud.checkpointVersion ||
    !sameValues(local.taskIds, cloud.taskIds) ||
    !sameValues(local.slots, cloud.slots) ||
    local.currentIndex < cloud.currentIndex
  ) {
    return "conflict";
  }
  for (let index = 0; index < cloud.currentIndex; index += 1) {
    if (
      local.outcomes[index] !== cloud.outcomes[index] ||
      local.completedAt[index] !== cloud.completedAt[index] ||
      !sameValues(local.answers[index], cloud.answers[index])
    ) {
      return "conflict";
    }
  }
  const remoteDraft = cloud.answers[cloud.currentIndex];
  const localAtRemotePosition = local.answers[cloud.currentIndex];
  if (
    remoteDraft.some((answer) => answer.length > 0) &&
    !sameValues(remoteDraft, localAtRemotePosition)
  ) {
    return "conflict";
  }
  return "continue";
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
