const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export const DIAGNOSTIC_TASK_COUNT = 10;
export const DIAGNOSTIC_ESTIMATED_MINUTES = 25;

export type DiagnosticRoute = "/diagnostic/new" | "/diagnostic/result";

export type DiagnosticRunQuery = {
  runId: string;
  taskIds: string[];
};

export function parseDiagnosticRunQuery(
  input: Record<string, string | string[] | undefined>,
  expectedTaskCount: number,
): DiagnosticRunQuery | null {
  const runId = input.run;
  const set = input.set;
  if (typeof runId !== "string" || typeof set !== "string") return null;
  if (!runId || !UUID_V4_PATTERN.test(runId) || !set) return null;
  const taskIds = set.split(",");
  if (
    taskIds.length !== expectedTaskCount ||
    new Set(taskIds).size !== taskIds.length ||
    taskIds.some((taskId) => !TASK_ID_PATTERN.test(taskId))
  ) {
    return null;
  }
  return { runId, taskIds };
}

export function isDiagnosticRunId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isDiagnosticTaskId(value: unknown): value is string {
  return typeof value === "string" && TASK_ID_PATTERN.test(value);
}

export function diagnosticRunHref(
  route: DiagnosticRoute,
  runId: string,
  taskIds: readonly string[],
): string {
  const params = new URLSearchParams({ run: runId, set: taskIds.join(",") });
  return `${route}?${params}`;
}
