import { HISTORY_RUN_LIMIT } from "./history-run-summary";
import {
  parseHistoryRunSyncResponse,
  type HistoryRunSync,
} from "./history-run-sync";

const HISTORY_RUNS = `
  query HistoryRuns($limit: Int!) {
    runs(limit: $limit) {
      id
      kind
      status
      blueprintVersion
      contentRevision
      startedAt
      submittedAt
      activeDurationMs
      taskIds
      itemCount
      completedItemCount
      correctItemCount
      earnedPoints
      maxPoints
    }
    latestSubmittedDiagnosticRun { id submittedAt }
  }
`;

export async function fetchHistoryRuns(
  signal?: AbortSignal,
): Promise<HistoryRunSync> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      operationName: "HistoryRuns",
      query: HISTORY_RUNS,
      variables: { limit: HISTORY_RUN_LIMIT },
    }),
  });
  if (!response.ok) {
    throw new Error(`history runs failed with status ${response.status}`);
  }
  const parsed = parseHistoryRunSyncResponse(
    (await response.json()) as unknown,
    HISTORY_RUN_LIMIT,
  );
  if (parsed === null) {
    throw new Error("history run sync returned an invalid response");
  }
  return parsed;
}
