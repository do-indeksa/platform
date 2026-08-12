import {
  HISTORY_RUN_LIMIT,
  parseHistoryRunResponse,
  type HistoryRunSummary,
} from "./history-run-summary";

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
  }
`;

export async function fetchHistoryRuns(): Promise<HistoryRunSummary[]> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      operationName: "HistoryRuns",
      query: HISTORY_RUNS,
      variables: { limit: HISTORY_RUN_LIMIT },
    }),
  });
  if (!response.ok) {
    throw new Error(`history runs failed with status ${response.status}`);
  }
  const parsed = parseHistoryRunResponse(
    (await response.json()) as unknown,
    HISTORY_RUN_LIMIT,
  );
  if (parsed === null) {
    throw new Error("history runs returned an invalid response");
  }
  return parsed;
}
