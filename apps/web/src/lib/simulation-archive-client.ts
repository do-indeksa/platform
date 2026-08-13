import { parseSimulationArchiveResponse } from "./simulation-archive-parser";
import type { SimulationArchiveRun } from "./simulation-archive";

export const SIMULATION_ARCHIVE_LIMIT = 20;

const COMPLETED_SIMULATION_ARCHIVE = `
  query CompletedSimulationArchive($limit: Int!) {
    completedSimulationRuns(limit: $limit) {
      id
      blueprintVersion
      contentRevision
      startedAt
      deadlineAt
      submittedAt
      activeDurationMs
      items {
        taskId
        examPosition
        topic
        maxPoints
        answerPartCount
        taskRevision
        answer
        outcome
        gradingKind
        earnedPoints
      }
    }
  }
`;

export async function fetchSimulationArchive(): Promise<
  SimulationArchiveRun[]
> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      operationName: "CompletedSimulationArchive",
      query: COMPLETED_SIMULATION_ARCHIVE,
      variables: { limit: SIMULATION_ARCHIVE_LIMIT },
    }),
  });
  if (!response.ok) {
    throw new Error(`simulation archive failed with status ${response.status}`);
  }
  const parsed = parseSimulationArchiveResponse(
    (await response.json()) as unknown,
    SIMULATION_ARCHIVE_LIMIT,
  );
  if (parsed === null) {
    throw new Error("simulation archive returned an invalid response");
  }
  return parsed;
}
