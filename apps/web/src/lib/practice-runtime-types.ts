import type {
  PracticeCloudAssignment,
  PracticeCloudAttempt,
  PracticeCloudAttemptOutcome,
  PracticeCloudDraftInput,
} from "./practice-cloud-types";

export const MAX_LOCAL_PRACTICE_RUNS = 20;

export type PracticeRuntimePhase = "active" | "submitting";

export type PracticeRuntimeDraft = {
  nextAttempt: number;
  answers: string[];
  helpLevel: number;
};

export type PracticeRuntimeItem = {
  taskId: string;
  attempts: PracticeCloudAttempt[];
  draft: PracticeRuntimeDraft | null;
};

export type PracticeCheckpointFlight = {
  id: string;
  purpose: "attempt" | "draft";
  attemptId: string | null;
  expectedVersion: number;
  appliedVersion: number | null;
  checkpointRevision: number;
  currentIndex: number;
  activeDurationMs: number;
  drafts: PracticeCloudDraftInput[];
};

export type PracticeRuntimeSubmission = {
  submittedAt: number;
  activeDurationMs: number;
};

export type PersistedPracticeRun = {
  assignment: PracticeCloudAssignment;
  runOwnerId: string | null;
  startedAt: number;
  startedRemotely: boolean;
  checkpointVersion: number;
  checkpointRevision: number;
  syncedAttemptCounts: number[];
  currentIndex: number;
  activeDurationMs: number;
  items: PracticeRuntimeItem[];
  checkpointDirty: boolean;
  checkpointFlight: PracticeCheckpointFlight | null;
  phase: PracticeRuntimePhase;
  submission: PracticeRuntimeSubmission | null;
  updatedAt: number;
};

export type PersistedPracticeRuntimeState = {
  runs: PersistedPracticeRun[];
};

export type PracticeRuntimeStart = {
  assignment: PracticeCloudAssignment;
  startedAt?: number;
};

export type PracticeRuntimeDraftChange = {
  taskId: string;
  answers: readonly string[];
  helpLevel: number;
  currentIndex: number;
  activeDurationMs: number;
};

export type PracticeRuntimeAttemptInput = {
  taskId: string;
  startedAt: number;
  submittedAt: number;
  activeDurationMs?: number;
  answers: readonly string[];
  outcome: PracticeCloudAttemptOutcome;
  helpLevel: number;
  currentIndex: number;
  runActiveDurationMs: number;
};
