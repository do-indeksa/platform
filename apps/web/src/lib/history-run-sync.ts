import { validate as isUuid } from "uuid";
import {
  HISTORY_RUN_LIMIT,
  parseHistoryRunResponse,
  type HistoryRunSummary,
} from "./history-run-summary";

export type LatestSubmittedDiagnosticRun = {
  id: string;
  submittedAt: string;
};

export type HistoryRunSync = {
  entries: HistoryRunSummary[];
  latestSubmittedDiagnosticRun: LatestSubmittedDiagnosticRun | null;
};

export function parseHistoryRunSyncResponse(
  value: unknown,
  limit = HISTORY_RUN_LIMIT,
): HistoryRunSync | null {
  const entries = parseHistoryRunResponse(value, limit);
  if (entries === null || !isRecord(value) || !isRecord(value.data)) {
    return null;
  }
  const candidate = value.data.latestSubmittedDiagnosticRun;
  if (candidate === null) {
    return { entries, latestSubmittedDiagnosticRun: null };
  }
  if (!isRecord(candidate)) return null;
  const { id, submittedAt } = candidate;
  if (typeof id !== "string" || !isUuid(id) || !isTimestamp(submittedAt)) {
    return null;
  }
  return {
    entries,
    latestSubmittedDiagnosticRun: { id, submittedAt },
  };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
