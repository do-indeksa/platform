const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const VERSION_PATTERN = /^\d{4}\.\d+$/;
const TASK_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type SimulationRoute = "/simulation/new" | "/simulation/result";

export type SimulationRunQuery = {
  runId: string;
  blueprintVersion: string;
  taskIds: string[];
};

export function parseSimulationRunQuery(
  input: Record<string, string | string[] | undefined>,
  expectedTaskCount: number,
): SimulationRunQuery | null {
  const runId = input.run;
  const blueprintVersion = input.version;
  const set = input.set;
  if (
    typeof runId !== "string" ||
    typeof blueprintVersion !== "string" ||
    typeof set !== "string" ||
    !isSimulationRunId(runId) ||
    !VERSION_PATTERN.test(blueprintVersion)
  ) {
    return null;
  }
  const taskIds = set.split(",");
  if (
    taskIds.length !== expectedTaskCount ||
    new Set(taskIds).size !== taskIds.length ||
    taskIds.some((taskId) => !isSimulationTaskId(taskId))
  ) {
    return null;
  }
  return { runId, blueprintVersion, taskIds };
}

export function isSimulationRunId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isSimulationTaskId(value: unknown): value is string {
  return typeof value === "string" && TASK_ID_PATTERN.test(value);
}

export function isSimulationBlueprintVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

export function isSimulationTaskRevision(value: unknown): value is string {
  return typeof value === "string" && TASK_REVISION_PATTERN.test(value);
}

export function parseSimulationTaskRevisions(
  value: string | string[] | undefined,
  expectedTaskCount: number,
): string[] | null {
  if (typeof value !== "string") return null;
  const revisions = value.split(",");
  return revisions.length === expectedTaskCount &&
    revisions.every(isSimulationTaskRevision)
    ? revisions
    : null;
}

export function simulationRunHref(
  route: SimulationRoute,
  run: SimulationRunQuery,
): string {
  return `${route}?${simulationRunParams(run)}`;
}

export function simulationResultHref(
  run: SimulationRunQuery,
  taskRevisions?: readonly string[],
): string {
  const params = simulationRunParams(run);
  if (taskRevisions !== undefined) {
    if (
      taskRevisions.length !== run.taskIds.length ||
      !taskRevisions.every(isSimulationTaskRevision)
    ) {
      throw new Error("simulation result revisions must match the task set");
    }
    params.set("revisions", taskRevisions.join(","));
  }
  return `/simulation/result?${params}`;
}

function simulationRunParams(run: SimulationRunQuery): URLSearchParams {
  return new URLSearchParams({
    run: run.runId,
    version: run.blueprintVersion,
    set: run.taskIds.join(","),
  });
}
