import {
  parseActiveSimulationRunIds,
  parseSimulationCloudRun,
  type SimulationCloudRun,
} from "./simulation-cloud-parser";
import {
  parsePersistedSimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import {
  parseCompletedProgressRun,
  progressRunItemId,
  type CompletedProgressRun,
} from "./progress-run";
import {
  FTN_P1_SIMULATION_DURATION_MS,
  isCompleteFtnP1SimulationItems,
} from "./simulation-run";
import type { ProgressCloudCatalog } from "./progress-cloud-types";
import type { SimulationProgressItem } from "./simulation-types";

export const SIMULATION_RUN_INDEX_LIMIT = 100;

const SIMULATION_RUN_INDEX = `
  query SimulationRunIndex($limit: Int!) {
    runs(limit: $limit) { id kind status startedAt }
  }
`;

const SIMULATION_CLOUD_RUN = `
  query SimulationCloudRun($id: ID!) {
    run(id: $id) {
      id
      kind
      status
      blueprintVersion
      contentRevision
      startedAt
      deadlineAt
      submittedAt
      activeDurationMs
      checkpoint {
        version
        currentOrdinal
        activeDurationMs
        updatedAt
        drafts { runItemId answer }
      }
      items {
        id
        taskId
        ordinal
        examPosition
        topic
        maxPoints
        answerPartCount
        taskRevision
        recentAttempts(limit: 2) {
          id
          runItemId
          taskId
          examPosition
          mode
          startedAt
          submittedAt
          activeDurationMs
          answer
          outcome
          helpLevel
          gradingKind
          earnedPoints
          maxPoints
          taskRevision
        }
      }
    }
  }
`;

const START_RUN = `
  mutation StartRun($input: StartRunInput!) {
    startRun(input: $input) { id status }
  }
`;

const CHECKPOINT_RUN = `
  mutation CheckpointRun($input: CheckpointRunInput!) {
    checkpointRun(input: $input) { version currentOrdinal }
  }
`;

const RECORD_ATTEMPT = `
  mutation RecordAttempt($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }
`;

const ABANDON_RUN = `
  mutation AbandonRun($input: AbandonRunInput!) {
    abandonRun(input: $input) { id status }
  }
`;

export class SimulationGraphQLError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SimulationGraphQLError";
  }
}

export type SimulationCloudUpload = {
  state: PersistedSimulationState;
  tasks: readonly (SimulationProgressItem & { answerPartCount: number })[];
  blueprintVersion: string;
  contentRevision: string;
};

export async function fetchLatestSimulationCloudRun(
  catalog: ProgressCloudCatalog,
  ownerId: string,
  signal?: AbortSignal,
): Promise<SimulationCloudRun | null> {
  const runs = await requestGraphQL(
    "SimulationRunIndex",
    SIMULATION_RUN_INDEX,
    { limit: SIMULATION_RUN_INDEX_LIMIT },
    "runs",
    signal,
  );
  const activeIds = parseActiveSimulationRunIds(
    runs,
    SIMULATION_RUN_INDEX_LIMIT,
  );
  if (activeIds === null) {
    throw new Error("simulation run index returned invalid data");
  }
  for (const runId of activeIds) {
    const run = await fetchSimulationCloudRun(runId, catalog, ownerId, signal);
    if (run !== null) return run;
  }
  return null;
}

export async function fetchSimulationCloudRun(
  runId: string,
  catalog: ProgressCloudCatalog,
  ownerId: string,
  signal?: AbortSignal,
): Promise<SimulationCloudRun | null> {
  const raw = await requestGraphQL(
    "SimulationCloudRun",
    SIMULATION_CLOUD_RUN,
    { id: runId },
    "run",
    signal,
  );
  if (raw === null) return null;
  return parseSimulationCloudRun(raw, catalog, ownerId);
}

export async function uploadSimulationCloudRun(
  upload: SimulationCloudUpload,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<number> {
  const state = parsePersistedSimulationState(upload.state);
  if (!matchesUpload(state, upload)) {
    throw new TypeError("simulation upload is inconsistent");
  }
  const runId = state.runId as string;
  requireCurrentOwner(isCurrentOwner);
  const started = await requestGraphQL(
    "StartRun",
    START_RUN,
    {
      input: {
        id: runId,
        kind: "SIMULATION",
        blueprintVersion: upload.blueprintVersion,
        contentRevision: upload.contentRevision,
        startedAt: new Date(state.startedAt as number).toISOString(),
        deadlineAt: new Date(state.endsAt as number).toISOString(),
        items: upload.tasks.map((task) => ({
          id: progressRunItemId(runId, task.taskId),
          taskId: task.taskId,
          examPosition: task.examPosition,
          topic: task.topic,
          maxPoints: task.maxPoints,
          answerPartCount: task.answerPartCount,
          taskRevision: task.taskRevision,
        })),
      },
    },
    "startRun",
    signal,
  );
  requireResult(started, runId, "ACTIVE");

  requireCurrentOwner(isCurrentOwner);
  const checkpoint = await requestGraphQL(
    "CheckpointRun",
    CHECKPOINT_RUN,
    {
      input: {
        id: runId,
        expectedVersion: state.checkpointVersion,
        currentOrdinal: state.currentIndex + 1,
        activeDurationMs: activeDuration(state),
        drafts: state.answers.flatMap((answers, index) => {
          const rubricScore = state.rubricScores[index] ?? null;
          return state.skipped[index] ||
            answers.some((answer) => answer.length > 0) ||
            rubricScore !== null
            ? [
                {
                  runItemId: progressRunItemId(
                    runId,
                    upload.tasks[index].taskId,
                  ),
                  answer:
                    state.phase === "reviewing"
                      ? JSON.stringify({
                          version: 1,
                          answers,
                          rubricScore,
                        })
                      : JSON.stringify(answers),
                },
              ]
            : [];
        }),
      },
    },
    "checkpointRun",
    signal,
  );
  if (
    !isRecord(checkpoint) ||
    checkpoint.version !== state.checkpointVersion + 1 ||
    checkpoint.currentOrdinal !== state.currentIndex + 1
  ) {
    throw new Error("checkpoint mutation returned invalid data");
  }
  return checkpoint.version;
}

export async function uploadSimulationAutoGradeRun(
  value: CompletedProgressRun,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<void> {
  const run = parseCompletedProgressRun(value);
  if (
    run === null ||
    run.kind !== "SIMULATION" ||
    run.deadlineAt === undefined ||
    run.items.some((item) => item.attempt.gradingKind !== "AUTO")
  ) {
    throw new TypeError("simulation auto grade is inconsistent");
  }
  requireCurrentOwner(isCurrentOwner);
  const started = await requestGraphQL(
    "StartRun",
    START_RUN,
    {
      input: {
        id: run.id,
        kind: run.kind,
        blueprintVersion: run.blueprintVersion,
        contentRevision: run.contentRevision,
        startedAt: run.startedAt,
        deadlineAt: run.deadlineAt,
        items: run.items.map((item) => ({
          id: item.id,
          taskId: item.taskId,
          examPosition: item.examPosition,
          topic: item.topic,
          maxPoints: item.maxPoints,
          ...(item.answerPartCount === undefined
            ? {}
            : { answerPartCount: item.answerPartCount }),
          taskRevision: item.taskRevision,
        })),
      },
    },
    "startRun",
    signal,
  );
  requireResult(started, run.id, "ACTIVE");

  for (const item of run.items) {
    requireCurrentOwner(isCurrentOwner);
    const attempt = item.attempt;
    const recorded = await requestGraphQL(
      "RecordAttempt",
      RECORD_ATTEMPT,
      {
        input: {
          id: attempt.id,
          runItemId: item.id,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          ...(attempt.answer === undefined ? {} : { answer: attempt.answer }),
          outcome: attempt.outcome,
          helpLevel: attempt.helpLevel,
          gradingKind: attempt.gradingKind,
          ...(attempt.earnedPoints === undefined
            ? {}
            : { earnedPoints: attempt.earnedPoints }),
        },
      },
      "recordAttempt",
      signal,
    );
    requireResult(recorded, attempt.id);
  }
}

export async function abandonSimulationCloudRun(
  runId: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await requestGraphQL(
    "AbandonRun",
    ABANDON_RUN,
    { input: { id: runId } },
    "abandonRun",
    signal,
  );
  requireResult(result, runId, "ABANDONED");
}

function matchesUpload(
  state: PersistedSimulationState,
  upload: SimulationCloudUpload,
): boolean {
  return (
    (state.phase === "running" ||
      state.phase === "submitting" ||
      state.phase === "reviewing") &&
    state.runId !== null &&
    state.startedAt !== null &&
    state.endsAt !== null &&
    state.endsAt - state.startedAt === FTN_P1_SIMULATION_DURATION_MS &&
    state.contentRevision === upload.contentRevision &&
    upload.blueprintVersion === `ftn-p1:${state.blueprintVersion}` &&
    isCompleteFtnP1SimulationItems(upload.tasks) &&
    upload.tasks.length === state.tasks.length &&
    upload.tasks.every((task, index) => {
      const local = state.tasks[index];
      return (
        task.taskId === local.id &&
        task.taskRevision === local.revision &&
        task.slot === local.slot &&
        task.examPosition === local.examPosition &&
        task.topic === local.topic &&
        task.maxPoints === local.maxPoints &&
        task.answerPartCount === local.fields.length
      );
    })
  );
}

function activeDuration(state: PersistedSimulationState): number {
  const startedAt = state.startedAt as number;
  const endsAt = state.endsAt as number;
  const measuredAt = state.submittedAt ?? Date.now();
  return Math.max(0, Math.min(measuredAt, endsAt) - startedAt);
}

function requireCurrentOwner(isCurrentOwner: () => boolean): void {
  if (!isCurrentOwner()) throw new DOMException("owner changed", "AbortError");
}

function requireResult(
  value: unknown,
  expectedId: string,
  expectedStatus?: string,
): void {
  if (
    !isRecord(value) ||
    value.id !== expectedId ||
    (expectedStatus !== undefined && value.status !== expectedStatus)
  ) {
    throw new Error("GraphQL mutation returned invalid data");
  }
}

async function requestGraphQL(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  field: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error("GraphQL returned invalid data");
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    const code =
      isRecord(first) &&
      isRecord(first.extensions) &&
      typeof first.extensions.code === "string"
        ? first.extensions.code
        : "GRAPHQL_ERROR";
    const message =
      isRecord(first) && typeof first.message === "string"
        ? first.message
        : "GraphQL request failed";
    throw new SimulationGraphQLError(message, code);
  }
  if (!isRecord(payload.data) || !(field in payload.data)) {
    throw new Error("GraphQL returned invalid data");
  }
  return payload.data[field];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
