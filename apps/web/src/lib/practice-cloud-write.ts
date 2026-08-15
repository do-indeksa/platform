import { validate as isUuid } from "uuid";
import { isPracticeRecord } from "./practice-cloud-contract";
import {
  ABANDON_PRACTICE_RUN_MUTATION,
  CHECKPOINT_PRACTICE_RUN_MUTATION,
  RECORD_PRACTICE_ATTEMPT_MUTATION,
  START_PRACTICE_RUN_MUTATION,
  SUBMIT_PRACTICE_RUN_MUTATION,
  requestPracticeGraphQL,
  requirePracticeResult,
} from "./practice-cloud-graphql";
import {
  isPracticeAnswers,
  isPracticeAttemptOutcome,
  isPracticeClientTime,
  isPracticeInteger,
  isPracticeOptionalDuration,
  requireCurrentPracticeOwner,
  requirePracticeAssignment,
  requirePracticeDraft,
} from "./practice-cloud-input";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import {
  MAX_PRACTICE_ATTEMPTS_PER_TASK,
  type PracticeCloudAssignment,
  type PracticeCloudAttemptInput,
  type PracticeCloudDraftInput,
} from "./practice-cloud-types";

export async function startPracticeCloudRun(
  assignment: PracticeCloudAssignment,
  startedAt: number,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  await requirePracticeAssignment(assignment);
  if (!isPracticeClientTime(startedAt)) {
    throw new TypeError("practice start time is invalid");
  }
  requireCurrentPracticeOwner(isCurrentOwner);
  const result = await requestPracticeGraphQL(
    "StartPracticeRun",
    START_PRACTICE_RUN_MUTATION,
    {
      input: {
        id: assignment.runId,
        kind: "PRACTICE",
        blueprintVersion: assignment.blueprintVersion,
        contentRevision: assignment.contentRevision,
        startedAt: new Date(startedAt).toISOString(),
        items: assignment.tasks.map((task) => ({
          id: progressRunItemId(assignment.runId, task.id),
          taskId: task.id,
          examPosition: task.slot,
          topic: task.topic,
          answerPartCount: task.answerPartCount,
          taskRevision: task.revision,
        })),
      },
    },
    "startRun",
    signal,
  );
  requireCurrentPracticeOwner(isCurrentOwner);
  requirePracticeResult(result, assignment.runId, "ACTIVE");
}

export async function checkpointPracticeCloudRun(
  assignment: PracticeCloudAssignment,
  input: {
    expectedVersion: number;
    currentIndex: number;
    activeDurationMs?: number;
    drafts: readonly PracticeCloudDraftInput[];
  },
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<number> {
  await requirePracticeAssignment(assignment);
  if (
    !isPracticeInteger(input.expectedVersion, 0, Number.MAX_SAFE_INTEGER) ||
    !isPracticeInteger(input.currentIndex, 0, assignment.tasks.length - 1) ||
    !isPracticeOptionalDuration(input.activeDurationMs)
  ) {
    throw new TypeError("practice checkpoint is invalid");
  }
  const taskById = new Map(assignment.tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const drafts = input.drafts.map((draft) => {
    const task = taskById.get(draft.taskId);
    if (task === undefined || seen.has(draft.taskId)) {
      throw new TypeError("practice checkpoint draft task is invalid");
    }
    seen.add(draft.taskId);
    requirePracticeDraft(draft, task);
    return {
      runItemId: progressRunItemId(assignment.runId, task.id),
      answer: JSON.stringify({
        version: 1,
        nextAttempt: draft.nextAttempt,
        answers: draft.answers,
        helpLevel: draft.helpLevel,
      }),
    };
  });

  requireCurrentPracticeOwner(isCurrentOwner);
  const result = await requestPracticeGraphQL(
    "CheckpointPracticeRun",
    CHECKPOINT_PRACTICE_RUN_MUTATION,
    {
      input: {
        id: assignment.runId,
        expectedVersion: input.expectedVersion,
        currentOrdinal: input.currentIndex + 1,
        ...(input.activeDurationMs === undefined
          ? {}
          : { activeDurationMs: input.activeDurationMs }),
        drafts,
      },
    },
    "checkpointRun",
    signal,
  );
  requireCurrentPracticeOwner(isCurrentOwner);
  if (
    !isPracticeRecord(result) ||
    result.version !== input.expectedVersion + 1 ||
    result.currentOrdinal !== input.currentIndex + 1
  ) {
    throw new Error("practice checkpoint mutation returned invalid data");
  }
  return result.version;
}

export async function recordPracticeCloudAttempt(
  assignment: PracticeCloudAssignment,
  input: PracticeCloudAttemptInput,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  await requirePracticeAssignment(assignment);
  const task = assignment.tasks.find(
    (candidate) => candidate.id === input.taskId,
  );
  if (
    task === undefined ||
    !isPracticeInteger(
      input.attemptNumber,
      1,
      MAX_PRACTICE_ATTEMPTS_PER_TASK,
    ) ||
    !isPracticeClientTime(input.startedAt) ||
    !isPracticeClientTime(input.submittedAt) ||
    input.submittedAt < input.startedAt ||
    !isPracticeOptionalDuration(input.activeDurationMs) ||
    (input.activeDurationMs !== undefined &&
      input.activeDurationMs >
        input.submittedAt - input.startedAt + 5 * 60_000) ||
    !isPracticeAnswers(input.answers, task.answerPartCount) ||
    !isPracticeAttemptOutcome(input.outcome) ||
    !isPracticeInteger(input.helpLevel, 0, 3)
  ) {
    throw new TypeError("practice attempt is invalid");
  }
  const runItemId = progressRunItemId(assignment.runId, task.id);
  const attemptId = progressPracticeAttemptId(runItemId, input.attemptNumber);
  requireCurrentPracticeOwner(isCurrentOwner);
  const result = await requestPracticeGraphQL(
    "RecordPracticeRunAttempt",
    RECORD_PRACTICE_ATTEMPT_MUTATION,
    {
      input: {
        id: attemptId,
        runItemId,
        startedAt: new Date(input.startedAt).toISOString(),
        submittedAt: new Date(input.submittedAt).toISOString(),
        ...(input.activeDurationMs === undefined
          ? {}
          : { activeDurationMs: input.activeDurationMs }),
        answer: JSON.stringify(input.answers),
        outcome: input.outcome.toUpperCase(),
        helpLevel: input.helpLevel,
        gradingKind: "AUTO",
      },
    },
    "recordAttempt",
    signal,
  );
  requireCurrentPracticeOwner(isCurrentOwner);
  requirePracticeResult(result, attemptId);
}

export async function submitPracticeCloudRun(
  runId: string,
  submittedAt: number,
  activeDurationMs: number,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  if (
    !isUuid(runId) ||
    !isPracticeClientTime(submittedAt) ||
    !isPracticeInteger(activeDurationMs, 0, Number.MAX_SAFE_INTEGER)
  ) {
    throw new TypeError("practice submission is invalid");
  }
  requireCurrentPracticeOwner(isCurrentOwner);
  const result = await requestPracticeGraphQL(
    "SubmitPracticeRun",
    SUBMIT_PRACTICE_RUN_MUTATION,
    {
      input: {
        id: runId,
        submittedAt: new Date(submittedAt).toISOString(),
        activeDurationMs,
      },
    },
    "submitRun",
    signal,
  );
  requireCurrentPracticeOwner(isCurrentOwner);
  requirePracticeResult(result, runId, "SUBMITTED");
}

export async function abandonPracticeCloudRun(
  runId: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!isUuid(runId)) throw new TypeError("practice run ID is invalid");
  const result = await requestPracticeGraphQL(
    "AbandonPracticeRun",
    ABANDON_PRACTICE_RUN_MUTATION,
    { input: { id: runId } },
    "abandonRun",
    signal,
  );
  requirePracticeResult(result, runId, "ABANDONED");
}
