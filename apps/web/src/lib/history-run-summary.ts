import { validate as isUuid } from "uuid";

export const HISTORY_RUN_LIMIT = 100;

const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const REVISION_PATTERN = /^.{1,128}$/;
const RUN_KINDS = new Set(["PRACTICE", "DIAGNOSTIC", "SIMULATION"]);
const RUN_STATUSES = new Set(["ACTIVE", "SUBMITTED", "ABANDONED"]);

export type HistoryRunKind = "PRACTICE" | "DIAGNOSTIC" | "SIMULATION";
export type HistoryRunStatus = "ACTIVE" | "SUBMITTED" | "ABANDONED";

export type HistoryRunSummary = {
  id: string;
  kind: HistoryRunKind;
  status: HistoryRunStatus;
  blueprintVersion: string;
  contentRevision: string;
  startedAt: string;
  submittedAt?: string;
  activeDurationMs?: number;
  taskIds: string[];
  itemCount: number;
  completedItemCount: number;
  correctItemCount: number;
  earnedPoints?: number;
  maxPoints?: number;
};

export function parseHistoryRunResponse(
  value: unknown,
  limit = HISTORY_RUN_LIMIT,
): HistoryRunSummary[] | null {
  if (!isRecord(value) || !isGraphQLSuccess(value) || !isRecord(value.data)) {
    return null;
  }
  const runs = value.data.runs;
  if (!Array.isArray(runs) || runs.length > limit) return null;

  const ids = new Set<string>();
  const parsed: HistoryRunSummary[] = [];
  for (const candidate of runs) {
    const run = parseHistoryRunSummary(candidate);
    if (run === null || ids.has(run.id)) return null;
    ids.add(run.id);
    parsed.push(run);
  }
  return parsed;
}

export function parseHistoryRunSummary(
  value: unknown,
): HistoryRunSummary | null {
  if (!isRecord(value)) return null;
  const {
    id,
    kind,
    status,
    blueprintVersion,
    contentRevision,
    startedAt,
    submittedAt,
    activeDurationMs,
    taskIds,
    itemCount,
    completedItemCount,
    correctItemCount,
    earnedPoints,
    maxPoints,
  } = value;
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    typeof kind !== "string" ||
    !RUN_KINDS.has(kind) ||
    typeof status !== "string" ||
    !RUN_STATUSES.has(status) ||
    typeof blueprintVersion !== "string" ||
    !REVISION_PATTERN.test(blueprintVersion) ||
    typeof contentRevision !== "string" ||
    !REVISION_PATTERN.test(contentRevision) ||
    !isTimestamp(startedAt) ||
    (submittedAt !== null && !isTimestamp(submittedAt)) ||
    (submittedAt !== null && Date.parse(submittedAt) < Date.parse(startedAt)) ||
    (activeDurationMs !== null && !isCount(activeDurationMs, 86_400_000)) ||
    !Array.isArray(taskIds) ||
    taskIds.length < 1 ||
    taskIds.length > 100 ||
    taskIds.some(
      (taskId) => typeof taskId !== "string" || !TASK_ID_PATTERN.test(taskId),
    ) ||
    new Set(taskIds).size !== taskIds.length ||
    !isCount(itemCount, 100) ||
    itemCount !== taskIds.length ||
    !isCount(completedItemCount, itemCount) ||
    !isCount(correctItemCount, completedItemCount) ||
    (earnedPoints !== null && !isCount(earnedPoints, 6_000)) ||
    (maxPoints !== null && !isCount(maxPoints, 6_000)) ||
    (earnedPoints !== null && maxPoints !== null && earnedPoints > maxPoints) ||
    (status === "SUBMITTED") !== (submittedAt !== null)
  ) {
    return null;
  }

  return {
    id,
    kind: kind as HistoryRunKind,
    status: status as HistoryRunStatus,
    blueprintVersion,
    contentRevision,
    startedAt,
    ...(submittedAt === null ? {} : { submittedAt }),
    ...(activeDurationMs === null ? {} : { activeDurationMs }),
    taskIds: [...taskIds] as string[],
    itemCount,
    completedItemCount,
    correctItemCount,
    ...(earnedPoints === null ? {} : { earnedPoints }),
    ...(maxPoints === null ? {} : { maxPoints }),
  };
}

function isGraphQLSuccess(value: Record<string, unknown>): boolean {
  return (
    value.errors === undefined ||
    (Array.isArray(value.errors) && value.errors.length === 0)
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isCount(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
