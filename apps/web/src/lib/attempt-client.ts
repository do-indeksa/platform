import {
  parseAttemptJournalResponse,
  parseRecordAttemptResponse,
  toPublicAttempt,
  type PendingLegacyAttempt,
  type PendingPracticeAttempt,
  type ServerAttempt,
} from "./attempt-journal";

const JOURNAL_LIMIT = 250;

const ATTEMPT_JOURNAL = `
  query AttemptJournal($limit: Int!) {
    attempts(limit: $limit) {
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
`;

const RECORD_PRACTICE_ATTEMPT = `
  mutation RecordPracticeAttempt($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }
`;

export async function fetchAttemptJournal(): Promise<ServerAttempt[]> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      operationName: "AttemptJournal",
      query: ATTEMPT_JOURNAL,
      variables: { limit: JOURNAL_LIMIT },
    }),
  });
  if (!response.ok) {
    throw new Error(`attempt journal failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  const parsed = parseAttemptJournalResponse(payload, JOURNAL_LIMIT);
  if (parsed === null) {
    throw new Error("attempt journal returned an invalid response");
  }
  return parsed;
}

export async function sendPracticeAttempt(
  attempt: PendingPracticeAttempt,
): Promise<void> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      operationName: "RecordPracticeAttempt",
      query: RECORD_PRACTICE_ATTEMPT,
      variables: { input: attempt.input },
    }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!parseRecordAttemptResponse(payload, attempt.input.id)) {
    throw new Error("GraphQL request returned an invalid result");
  }
}

export async function sendLegacyAttempts(
  attempts: PendingLegacyAttempt[],
): Promise<boolean> {
  const response = await fetch("/api/v1/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attempts.map(toPublicAttempt)),
  });
  if ([400, 413, 415].includes(response.status)) return false;
  if (!response.ok) {
    throw new Error(
      `legacy attempt flush failed with status ${response.status}`,
    );
  }
  return true;
}
