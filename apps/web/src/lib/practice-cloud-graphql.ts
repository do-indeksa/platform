import { isPracticeRecord } from "./practice-cloud-contract";

export const PRACTICE_RUN_INDEX_QUERY = `
  query PracticeRunIndex($limit: Int!) {
    runs(limit: $limit) { id kind status startedAt }
  }
`;

export const PRACTICE_CLOUD_RUN_QUERY = `
  query PracticeCloudRun($id: ID!) {
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
        answerPartCount
        taskRevision
        recentAttempts(limit: 20) {
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
          taskRevision
        }
      }
    }
  }
`;

export const START_PRACTICE_RUN_MUTATION = `
  mutation StartPracticeRun($input: StartRunInput!) {
    startRun(input: $input) { id status }
  }
`;

export const CHECKPOINT_PRACTICE_RUN_MUTATION = `
  mutation CheckpointPracticeRun($input: CheckpointRunInput!) {
    checkpointRun(input: $input) { version currentOrdinal }
  }
`;

export const RECORD_PRACTICE_ATTEMPT_MUTATION = `
  mutation RecordPracticeRunAttempt($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }
`;

export const SUBMIT_PRACTICE_RUN_MUTATION = `
  mutation SubmitPracticeRun($input: SubmitRunInput!) {
    submitRun(input: $input) { id status }
  }
`;

export const ABANDON_PRACTICE_RUN_MUTATION = `
  mutation AbandonPracticeRun($input: AbandonRunInput!) {
    abandonRun(input: $input) { id status }
  }
`;

export class PracticeGraphQLError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PracticeGraphQLError";
  }
}

export function requirePracticeResult(
  value: unknown,
  expectedId: string,
  expectedStatus?: string,
): void {
  if (
    !isPracticeRecord(value) ||
    value.id !== expectedId ||
    (expectedStatus !== undefined && value.status !== expectedStatus)
  ) {
    throw new Error("practice GraphQL mutation returned invalid data");
  }
}

export async function requestPracticeGraphQL(
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
  if (!isPracticeRecord(payload)) {
    throw new Error("GraphQL returned invalid data");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    const code =
      isPracticeRecord(first) &&
      isPracticeRecord(first.extensions) &&
      typeof first.extensions.code === "string"
        ? first.extensions.code
        : "GRAPHQL_ERROR";
    const message =
      isPracticeRecord(first) && typeof first.message === "string"
        ? first.message
        : "GraphQL request failed";
    throw new PracticeGraphQLError(message, code);
  }
  if (!isPracticeRecord(payload.data) || !(field in payload.data)) {
    throw new Error("GraphQL returned invalid data");
  }
  return payload.data[field];
}
