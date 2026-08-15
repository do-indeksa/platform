import { validate as isUuid } from "uuid";
import {
  parseActivePracticeRunIds,
  parsePracticeCloudRun,
  resolvePracticeCloudAssignment,
} from "./practice-cloud-parser";
import { practiceTaskSetRevision } from "./practice-cloud-revision";
import {
  PRACTICE_CLOUD_RUN_QUERY,
  PRACTICE_RUN_INDEX_QUERY,
  requestPracticeGraphQL,
} from "./practice-cloud-graphql";
import { requirePracticeAssignment } from "./practice-cloud-input";
import type {
  PracticeCloudAssignment,
  PracticeCloudCatalog,
  PracticeCloudRun,
} from "./practice-cloud-types";

export const PRACTICE_RUN_INDEX_LIMIT = 100;

export async function fetchPracticeCloudRun(
  assignment: PracticeCloudAssignment,
  ownerId: string,
  signal?: AbortSignal,
): Promise<PracticeCloudRun | null> {
  await requirePracticeAssignment(assignment);
  const raw = await fetchRawPracticeCloudRun(assignment.runId, signal);
  return raw === null ? null : parsePracticeCloudRun(raw, assignment, ownerId);
}

export async function fetchLatestPracticeCloudRun(
  catalog: PracticeCloudCatalog,
  ownerId: string,
  signal?: AbortSignal,
): Promise<PracticeCloudRun | null> {
  const summaries = await requestPracticeGraphQL(
    "PracticeRunIndex",
    PRACTICE_RUN_INDEX_QUERY,
    { limit: PRACTICE_RUN_INDEX_LIMIT },
    "runs",
    signal,
  );
  const activeIds = parseActivePracticeRunIds(
    summaries,
    PRACTICE_RUN_INDEX_LIMIT,
  );
  if (activeIds === null) {
    throw new Error("practice run index returned invalid data");
  }
  for (const runId of activeIds) {
    const raw = await fetchRawPracticeCloudRun(runId, signal);
    if (raw === null) continue;
    const assignment = resolvePracticeCloudAssignment(raw, catalog);
    if (
      assignment === null ||
      (await practiceTaskSetRevision(assignment.tasks)) !==
        assignment.contentRevision
    ) {
      continue;
    }
    const parsed = parsePracticeCloudRun(raw, assignment, ownerId);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function fetchRawPracticeCloudRun(
  runId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!isUuid(runId)) throw new TypeError("practice run ID is invalid");
  return requestPracticeGraphQL(
    "PracticeCloudRun",
    PRACTICE_CLOUD_RUN_QUERY,
    { id: runId },
    "run",
    signal,
  );
}
