import type { SimulationCloudRun } from "./simulation-cloud-parser";
import type { PersistedSimulationState } from "./simulation-persistence";

export type SimulationCloudReconciliation =
  "discover" | "merge" | "conflict" | "ignore-completed";

export function reconcileSimulationCloudState(
  local: PersistedSimulationState,
  remote: SimulationCloudRun,
): SimulationCloudReconciliation {
  if (local.phase === null) return "discover";
  if (local.phase === "done") {
    return local.runId === remote.runtime.runId
      ? "ignore-completed"
      : "discover";
  }
  return mergeSimulationCloudState(local, remote) === null
    ? "conflict"
    : "merge";
}

export function mergeSimulationCloudState(
  local: PersistedSimulationState,
  remote: SimulationCloudRun,
): PersistedSimulationState | null {
  const cloud = remote.runtime;
  if (
    (local.phase !== "running" &&
      local.phase !== "submitting" &&
      local.phase !== "reviewing") ||
    local.runId !== cloud.runId ||
    local.runOwnerId !== cloud.runOwnerId ||
    local.blueprintVersion !== cloud.blueprintVersion ||
    local.contentRevision !== cloud.contentRevision ||
    local.startedAt !== cloud.startedAt ||
    local.endsAt !== cloud.endsAt ||
    (local.submittedAt !== null &&
      cloud.submittedAt !== null &&
      local.submittedAt !== cloud.submittedAt) ||
    local.checkpointVersion > cloud.checkpointVersion ||
    local.tasks.length !== cloud.tasks.length ||
    local.answers.length !== cloud.answers.length ||
    local.skipped.length !== cloud.skipped.length ||
    !local.tasks.every((task, index) => {
      const remoteTask = cloud.tasks[index];
      return (
        task.id === remoteTask.id &&
        task.revision === remoteTask.revision &&
        task.slot === remoteTask.slot &&
        task.examPosition === remoteTask.examPosition &&
        task.maxPoints === remoteTask.maxPoints &&
        task.topic === remoteTask.topic &&
        task.fields.length === remoteTask.answerPartCount
      );
    })
  ) {
    return null;
  }

  const answers = local.answers.map((taskAnswers) => [...taskAnswers]);
  const skipped = [...local.skipped];
  for (let index = 0; index < answers.length; index += 1) {
    const localTouched = touched(answers[index], skipped[index]);
    const remoteTouched = touched(cloud.answers[index], cloud.skipped[index]);
    if (cloud.phase === "submitting" && localTouched && !remoteTouched) {
      return null;
    }
    if (
      localTouched &&
      remoteTouched &&
      (!sameValues(answers[index], cloud.answers[index]) ||
        skipped[index] !== cloud.skipped[index])
    ) {
      return null;
    }
    if (!localTouched && remoteTouched) {
      answers[index] = [...cloud.answers[index]];
      skipped[index] = cloud.skipped[index];
    }
  }
  const rubricScores = mergeRubricScores(
    local.rubricScores,
    cloud.rubricScores,
    local.tasks.length,
  );
  if (rubricScores === null) return null;

  const remoteIsNewer = cloud.checkpointVersion > local.checkpointVersion;
  return {
    ...local,
    checkpointVersion: cloud.checkpointVersion,
    answers,
    skipped,
    rubricScores,
    phase:
      local.phase === "reviewing"
        ? "reviewing"
        : local.phase === "submitting" || cloud.phase === "submitting"
          ? "submitting"
          : "running",
    submittedAt: local.submittedAt ?? cloud.submittedAt,
    currentIndex: remoteIsNewer ? cloud.currentIndex : local.currentIndex,
    savedAt: latestTimestamp(local.savedAt, cloud.savedAt),
    timedOut: local.timedOut || cloud.timedOut,
  };
}

function mergeRubricScores(
  local: readonly (number | null)[],
  remote: readonly (number | null)[],
  taskCount: number,
): (number | null)[] | null {
  const localScores =
    local.length === 0 ? Array<null>(taskCount).fill(null) : local;
  const remoteScores =
    remote.length === 0 ? Array<null>(taskCount).fill(null) : remote;
  if (localScores.length !== taskCount || remoteScores.length !== taskCount) {
    return null;
  }
  if (
    localScores.some(
      (score, index) =>
        score !== null &&
        remoteScores[index] !== null &&
        score !== remoteScores[index],
    )
  ) {
    return null;
  }
  const merged = localScores.map(
    (score, index) => score ?? remoteScores[index],
  );
  return local.length === 0 && remote.length === 0 ? [] : merged;
}

function touched(answers: readonly string[], skipped: boolean): boolean {
  return skipped || answers.some((answer) => answer.length > 0);
}

function latestTimestamp(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
