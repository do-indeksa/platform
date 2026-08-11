import {
  parseActiveDiagnosticRunIds,
  parseDiagnosticCloudRun,
  type DiagnosticCloudRun,
} from "./diagnostic-cloud-parser";
import type { DiagnosticProgressTask } from "./diagnostic-progress";
import {
  parsePersistedDiagnosticState,
  type PersistedDiagnosticState,
} from "./diagnostic-store";
import { progressAttemptId, progressRunItemId } from "./progress-run";
import type { DiagnosticCloudCatalog } from "./diagnostic-cloud-types";

export const DIAGNOSTIC_RUN_INDEX_LIMIT = 100;

const DIAGNOSTIC_RUN_INDEX = `
  query DiagnosticRunIndex($limit: Int!) {
    runs(limit: $limit) { id kind status startedAt }
  }
`;

const DIAGNOSTIC_CLOUD_RUN = `
  query DiagnosticCloudRun($id: ID!) {
    run(id: $id) {
      id
      kind
      status
      blueprintVersion
      contentRevision
      startedAt
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
        taskRevision
        recentAttempts(limit: 2) {
          id
          runItemId
          taskId
          examPosition
          mode
          startedAt
          submittedAt
          answer
          outcome
          helpLevel
          gradingKind
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

const RECORD_ATTEMPT = `
  mutation RecordAttempt($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }
`;

const CHECKPOINT_RUN = `
  mutation CheckpointRun($input: CheckpointRunInput!) {
    checkpointRun(input: $input) { version currentOrdinal }
  }
`;

const ABANDON_RUN = `
  mutation AbandonRun($input: AbandonRunInput!) {
    abandonRun(input: $input) { id status }
  }
`;

export class DiagnosticGraphQLError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "DiagnosticGraphQLError";
  }
}

export type DiagnosticCloudUpload = {
  state: PersistedDiagnosticState;
  tasks: readonly DiagnosticProgressTask[];
  blueprintVersion: string;
  contentRevision: string;
};

export async function fetchLatestDiagnosticCloudRun(
  catalog: DiagnosticCloudCatalog,
  ownerId: string,
  signal?: AbortSignal,
): Promise<DiagnosticCloudRun | null> {
  const runs = await requestGraphQL(
    "DiagnosticRunIndex",
    DIAGNOSTIC_RUN_INDEX,
    { limit: DIAGNOSTIC_RUN_INDEX_LIMIT },
    "runs",
    signal,
  );
  const activeIds = parseActiveDiagnosticRunIds(
    runs,
    DIAGNOSTIC_RUN_INDEX_LIMIT,
  );
  if (activeIds === null) {
    throw new Error("diagnostic run index returned invalid data");
  }
  for (const runId of activeIds) {
    const run = await fetchDiagnosticCloudRun(runId, catalog, ownerId, signal);
    if (run !== null) return run;
  }
  return null;
}

export async function fetchDiagnosticCloudRun(
  runId: string,
  catalog: DiagnosticCloudCatalog,
  ownerId: string,
  signal?: AbortSignal,
): Promise<DiagnosticCloudRun | null> {
  const raw = await requestGraphQL(
    "DiagnosticCloudRun",
    DIAGNOSTIC_CLOUD_RUN,
    { id: runId },
    "run",
    signal,
  );
  if (raw === null) return null;
  return parseDiagnosticCloudRun(raw, catalog, ownerId);
}

export async function uploadDiagnosticCloudRun(
  upload: DiagnosticCloudUpload,
  isCurrentOwner: () => boolean,
  signal?: AbortSignal,
): Promise<number> {
  const state = parsePersistedDiagnosticState(upload.state);
  if (!matchesUpload(state, upload.tasks)) {
    throw new TypeError("diagnostic upload is inconsistent");
  }
  const runId = state.runId as string;
  requireCurrentOwner(isCurrentOwner);
  const started = await requestGraphQL(
    "StartRun",
    START_RUN,
    {
      input: {
        id: runId,
        kind: "DIAGNOSTIC",
        blueprintVersion: upload.blueprintVersion,
        contentRevision: upload.contentRevision,
        startedAt: new Date(state.startedAt as number).toISOString(),
        items: upload.tasks.map((task) => ({
          id: progressRunItemId(runId, task.id),
          taskId: task.id,
          examPosition: task.examPosition,
          topic: task.topic,
          taskRevision: task.revision,
        })),
      },
    },
    "startRun",
    signal,
  );
  requireResult(started, runId, "ACTIVE");

  for (let index = 0; index < state.currentIndex; index += 1) {
    requireCurrentOwner(isCurrentOwner);
    const task = upload.tasks[index];
    const runItemId = progressRunItemId(runId, task.id);
    const outcome = state.outcomes[index];
    const completedAt = state.completedAt[index];
    const previousCompletedAt =
      index === 0 ? state.startedAt : state.completedAt[index - 1];
    if (
      outcome === null ||
      completedAt === null ||
      previousCompletedAt === null
    ) {
      throw new TypeError("diagnostic attempt is incomplete");
    }
    const attemptId = progressAttemptId(runItemId);
    const attempt = await requestGraphQL(
      "RecordAttempt",
      RECORD_ATTEMPT,
      {
        input: {
          id: attemptId,
          runItemId,
          startedAt: new Date(previousCompletedAt).toISOString(),
          submittedAt: new Date(completedAt).toISOString(),
          ...(outcome === "skipped"
            ? {}
            : { answer: JSON.stringify(state.answers[index]) }),
          outcome:
            outcome === "correct"
              ? "CORRECT"
              : outcome === "incorrect"
                ? "INCORRECT"
                : "SKIPPED",
          helpLevel: 0,
          gradingKind: "AUTO",
        },
      },
      "recordAttempt",
      signal,
    );
    requireResult(attempt, attemptId);
  }

  requireCurrentOwner(isCurrentOwner);
  const currentAnswers = state.answers[state.currentIndex];
  const checkpoint = await requestGraphQL(
    "CheckpointRun",
    CHECKPOINT_RUN,
    {
      input: {
        id: runId,
        expectedVersion: state.checkpointVersion,
        currentOrdinal: state.currentIndex + 1,
        drafts: currentAnswers.some((answer) => answer.length > 0)
          ? [
              {
                runItemId: progressRunItemId(
                  runId,
                  upload.tasks[state.currentIndex].id,
                ),
                answer: JSON.stringify(currentAnswers),
              },
            ]
          : [],
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

export async function abandonDiagnosticCloudRun(
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
  state: PersistedDiagnosticState,
  tasks: readonly DiagnosticProgressTask[],
): boolean {
  return (
    state.phase === "running" &&
    state.runId !== null &&
    state.startedAt !== null &&
    tasks.length === state.taskIds.length &&
    tasks.every(
      (task, index) =>
        task.id === state.taskIds[index] && task.slot === state.slots[index],
    )
  );
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
    throw new DiagnosticGraphQLError(message, code);
  }
  if (!isRecord(payload.data) || !(field in payload.data)) {
    throw new Error("GraphQL returned invalid data");
  }
  return payload.data[field];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
