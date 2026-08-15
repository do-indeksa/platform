import type {
  PracticeCloudAssignment,
  PracticeCloudAttemptInput,
  PracticeCloudDraftInput,
  PracticeCloudRun,
} from "./practice-cloud-types";

export type PracticeRuntimeSyncResult =
  | { status: "synced" }
  | { status: "offline" }
  | { status: "conflict"; code: string }
  | { status: "aborted" }
  | { status: "missing" };

export type PracticeRuntimeSyncEntry = {
  runId: string;
  result: PracticeRuntimeSyncResult;
};

export type PracticeRuntimeSyncSummary = {
  entries: PracticeRuntimeSyncEntry[];
  status: "synced" | "offline" | "conflict" | "aborted";
};

export type PracticeRuntimeTransport = {
  start: (
    assignment: PracticeCloudAssignment,
    startedAt: number,
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  checkpoint: (
    assignment: PracticeCloudAssignment,
    input: {
      expectedVersion: number;
      currentIndex: number;
      activeDurationMs?: number;
      drafts: readonly PracticeCloudDraftInput[];
    },
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<number>;
  recordAttempt: (
    assignment: PracticeCloudAssignment,
    input: PracticeCloudAttemptInput,
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  submit: (
    runId: string,
    submittedAt: number,
    activeDurationMs: number,
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  acknowledge: (
    ownerId: string,
    attemptIds: readonly string[],
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  abandon: (
    runId: string,
    isCurrentOwner: () => boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  fetch: (
    assignment: PracticeCloudAssignment,
    ownerId: string,
    signal?: AbortSignal,
  ) => Promise<PracticeCloudRun | null>;
};

export type PracticeRuntimeSyncOptions = {
  signal?: AbortSignal;
  transport?: PracticeRuntimeTransport;
};
