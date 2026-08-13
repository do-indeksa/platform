import type {
  PracticeCloudAttempt,
  PracticeCloudDraftInput,
  PracticeCloudRun,
  PracticeCloudTask,
} from "./practice-cloud-types";
import type { PersistedPracticeRun } from "./practice-runtime-types";

export function matchesPracticeCheckpointRecovery(
  local: PersistedPracticeRun,
  remote: PracticeCloudRun,
): boolean {
  const flight = local.checkpointFlight;
  if (
    flight === null ||
    flight.appliedVersion !== null ||
    local.runOwnerId === null ||
    remote.runId !== local.assignment.runId ||
    remote.runOwnerId !== local.runOwnerId ||
    remote.blueprintVersion !== local.assignment.blueprintVersion ||
    remote.contentRevision !== local.assignment.contentRevision ||
    remote.startedAt !== local.startedAt ||
    remote.checkpointVersion !== flight.expectedVersion + 1 ||
    remote.currentIndex !== flight.currentIndex ||
    remote.activeDurationMs !== flight.activeDurationMs ||
    !sameTasks(
      local.assignment.tasks,
      remote.items.map(({ task }) => task),
    )
  ) {
    return false;
  }
  return (
    hasExpectedAttempts(local, remote) &&
    hasExpectedDrafts(remote, flight.drafts)
  );
}

function hasExpectedAttempts(
  local: PersistedPracticeRun,
  remote: PracticeCloudRun,
): boolean {
  return local.items.every((item, itemIndex) => {
    const remoteItem = remote.items[itemIndex];
    const syncedCount = local.syncedAttemptCounts[itemIndex];
    return (
      remoteItem !== undefined &&
      remoteItem.attempts.length === syncedCount &&
      remoteItem.attempts.every((attempt, attemptIndex) =>
        sameAttempt(attempt, item.attempts[attemptIndex]),
      )
    );
  });
}

function hasExpectedDrafts(
  remote: PracticeCloudRun,
  expected: readonly PracticeCloudDraftInput[],
): boolean {
  const expectedByTask = new Map(
    expected.map((draft) => [draft.taskId, draft]),
  );
  let remoteCount = 0;
  for (const item of remote.items) {
    const draft = item.draft;
    if (draft === null) continue;
    remoteCount += 1;
    const match = expectedByTask.get(item.task.id);
    if (
      match === undefined ||
      draft.stale ||
      draft.nextAttempt !== match.nextAttempt ||
      draft.helpLevel !== match.helpLevel ||
      !sameAnswers(draft.answers, match.answers)
    ) {
      return false;
    }
  }
  return remoteCount === expectedByTask.size;
}

function sameTasks(
  left: readonly PracticeCloudTask[],
  right: readonly PracticeCloudTask[],
): boolean {
  return (
    left.length === right.length &&
    left.every((task, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        task.id === other.id &&
        task.revision === other.revision &&
        task.slot === other.slot &&
        task.topic === other.topic &&
        task.answerPartCount === other.answerPartCount
      );
    })
  );
}

function sameAttempt(
  left: PracticeCloudAttempt,
  right: PracticeCloudAttempt | undefined,
): boolean {
  return (
    right !== undefined &&
    left.id === right.id &&
    left.number === right.number &&
    left.startedAt === right.startedAt &&
    left.submittedAt === right.submittedAt &&
    left.activeDurationMs === right.activeDurationMs &&
    left.outcome === right.outcome &&
    left.helpLevel === right.helpLevel &&
    sameAnswers(left.answers, right.answers)
  );
}

function sameAnswers(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((answer, index) => answer === right[index])
  );
}
