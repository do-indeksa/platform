export const MAX_PRACTICE_RUN_TASKS = 30;
export const MAX_PRACTICE_ATTEMPTS_PER_TASK = 20;

export type PracticeCloudTask = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  answerPartCount: number;
};

export type PracticeCloudAssignment = {
  runId: string;
  blueprintVersion: string;
  contentRevision: string;
  tasks: readonly PracticeCloudTask[];
};

export type PracticeCloudCatalog = {
  blueprintVersion: string;
  tasks: readonly PracticeCloudTask[];
};

export type PracticeCloudAttemptOutcome = "correct" | "incorrect" | "skipped";

export type PracticeCloudAttempt = {
  id: string;
  number: number;
  startedAt: number;
  submittedAt: number;
  activeDurationMs: number | null;
  answers: string[];
  outcome: PracticeCloudAttemptOutcome;
  helpLevel: number;
};

export type PracticeCloudDraft = {
  nextAttempt: number;
  answers: string[];
  helpLevel: number;
  stale: boolean;
};

export type PracticeCloudItem = {
  runItemId: string;
  task: PracticeCloudTask;
  attempts: PracticeCloudAttempt[];
  draft: PracticeCloudDraft | null;
};

export type PracticeCloudRun = {
  runId: string;
  runOwnerId: string;
  blueprintVersion: string;
  contentRevision: string;
  startedAt: number;
  checkpointVersion: number;
  currentIndex: number;
  activeDurationMs: number | null;
  checkpointUpdatedAt: string | null;
  items: PracticeCloudItem[];
};

export type PracticeCloudAttemptInput = {
  taskId: string;
  attemptNumber: number;
  startedAt: number;
  submittedAt: number;
  activeDurationMs?: number;
  answers: readonly string[];
  outcome: PracticeCloudAttemptOutcome;
  helpLevel: number;
};

export type PracticeCloudDraftInput = {
  taskId: string;
  nextAttempt: number;
  answers: readonly string[];
  helpLevel: number;
};
