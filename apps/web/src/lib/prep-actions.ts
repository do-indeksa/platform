import type { TaskReference } from "@/lib/content";
import {
  PREP_CONFIDENCE_ATTEMPTS,
  PREP_DIAGNOSTIC_MINUTES,
  PREP_MAX_TASK_COUNT,
  PREP_MIN_TASK_COUNT,
  PREP_TASK_MINUTES,
  type PrepAction,
  type PrepPositionDefinition,
  type PrepPositionProgress,
} from "./prep-plan-types";
import type { MappedAttempt } from "./prep-readiness";
import { selectCheckTasks, selectPositionTasks } from "./prep-task-selection";

export function buildCoreAction(
  attempts: readonly MappedAttempt[],
  progress: readonly PrepPositionProgress[],
  positions: readonly PrepPositionDefinition[],
  taskReferences: readonly TaskReference[],
  dayStartMs: number,
  baselineEstablished: boolean,
  practiceTaskCount: number,
): PrepAction {
  if (!baselineEstablished) {
    return diagnosticAction(
      attempts.length === 0 ? "noData" : "missingBaseline",
      positions.length,
    );
  }

  const priority =
    progress
      .filter((position) => position.status !== "confident")
      .toSorted(comparePriority)[0] ??
    progress
      .filter((position) => isStale(position, dayStartMs))
      .toSorted(
        (left, right) =>
          Date.parse(left.lastAttemptAt ?? "1970-01-01") -
            Date.parse(right.lastAttemptAt ?? "1970-01-01") ||
          left.number - right.number,
      )[0];
  if (priority) {
    const taskIds = selectPositionTasks(
      priority.number,
      positions,
      taskReferences,
      attempts,
      practiceTaskCount,
    );
    if (taskIds.length >= PREP_MIN_TASK_COUNT) {
      const { reason, reasonCount } = positionReason(priority, dayStartMs);
      return taskAction({
        id: `practice-${priority.number}`,
        kind: "practice",
        position: priority.number,
        taskIds,
        reason,
        reasonCount,
      });
    }
  }

  const taskIds = selectCheckTasks(
    progress,
    positions,
    taskReferences,
    attempts,
    new Set(),
    practiceTaskCount,
  );
  return taskAction({
    id: `check-${taskIds.join("-") || "bank"}`,
    kind: "check",
    taskIds,
    reason: "maintain",
  });
}

export function buildSupplementaryAction(
  attempts: readonly MappedAttempt[],
  progress: readonly PrepPositionProgress[],
  positions: readonly PrepPositionDefinition[],
  taskReferences: readonly TaskReference[],
  excludedTaskIds: ReadonlySet<string>,
  practiceTaskCount: number,
): PrepAction {
  if (attempts.length === 0) {
    const candidate = progress
      .map((position) => ({
        position,
        taskIds: selectPositionTasks(
          position.number,
          positions,
          taskReferences,
          attempts,
          practiceTaskCount,
        ).filter((taskId) => !excludedTaskIds.has(taskId)),
      }))
      .find(({ taskIds }) => taskIds.length >= PREP_MIN_TASK_COUNT);
    if (candidate) {
      return taskAction({
        id: `practice-${candidate.position.number}`,
        kind: "practice",
        position: candidate.position.number,
        taskIds: candidate.taskIds,
        reason: "untested",
      });
    }
  }

  const latestByTask = new Map<string, MappedAttempt>();
  for (const attempt of attempts) latestByTask.set(attempt.taskId, attempt);
  const knownTaskIds = new Set(taskReferences.map((task) => task.id));
  const errorTaskIds = [...latestByTask.values()]
    .filter(
      (attempt) =>
        !attempt.correct &&
        knownTaskIds.has(attempt.taskId) &&
        !excludedTaskIds.has(attempt.taskId),
    )
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, Math.min(2, practiceTaskCount))
    .map((attempt) => attempt.taskId);
  if (errorTaskIds.length > 0) {
    const supportingTaskIds = selectCheckTasks(
      progress,
      positions,
      taskReferences,
      attempts,
      new Set([...excludedTaskIds, ...errorTaskIds]),
      practiceTaskCount - errorTaskIds.length,
    );
    const taskIds = [...errorTaskIds, ...supportingTaskIds];
    if (taskIds.length >= PREP_MIN_TASK_COUNT) {
      return taskAction({
        id: `review-${taskIds.join("-")}`,
        kind: "review",
        taskIds,
        reason: "recentErrors",
        reasonCount: errorTaskIds.length,
      });
    }
  }

  const taskIds = selectCheckTasks(
    progress,
    positions,
    taskReferences,
    attempts,
    excludedTaskIds,
    practiceTaskCount,
  );
  return taskAction({
    id: `check-${taskIds.join("-") || "bank"}`,
    kind: "check",
    taskIds,
    reason: "maintain",
  });
}

export function diagnosticAction(
  reason: "noData" | "missingBaseline",
  positionCount: number,
): PrepAction {
  return action({
    id: "diagnostic",
    kind: "diagnostic",
    count: positionCount,
    minutes: PREP_DIAGNOSTIC_MINUTES,
    reason,
  });
}

export function settingsAction(completed: boolean): PrepAction {
  return action({
    id: "settings",
    kind: "settings",
    count: 2,
    minutes: 1,
    reason: "preferences",
    completed,
  });
}

export function actionCompleted(
  action: PrepAction,
  today: readonly MappedAttempt[],
  settingsComplete: boolean,
  diagnosticCompletedToday: boolean,
): boolean {
  if (action.kind === "settings") return settingsComplete;
  if (action.kind === "diagnostic") {
    return (
      diagnosticCompletedToday ||
      today.some((attempt) => attempt.source === "diagnostic")
    );
  }
  if (action.taskIds.length === 0) return false;
  if (action.kind === "review") {
    return action.taskIds.every((taskId) =>
      today.some((attempt) => attempt.taskId === taskId && attempt.correct),
    );
  }
  return action.taskIds.every((taskId) =>
    today.some((attempt) => attempt.taskId === taskId),
  );
}

function action(
  value: Omit<
    PrepAction,
    "completed" | "position" | "taskIds" | "reasonCount"
  > &
    Partial<
      Pick<PrepAction, "completed" | "position" | "taskIds" | "reasonCount">
    >,
): PrepAction {
  return {
    completed: false,
    position: null,
    taskIds: [],
    reasonCount: 0,
    ...value,
  };
}

function taskAction(
  value: Omit<
    PrepAction,
    "completed" | "count" | "minutes" | "position" | "reasonCount"
  > &
    Partial<Pick<PrepAction, "completed" | "position" | "reasonCount">>,
): PrepAction {
  const uniqueTaskIds = new Set(value.taskIds);
  if (
    value.taskIds.length < PREP_MIN_TASK_COUNT ||
    value.taskIds.length > PREP_MAX_TASK_COUNT ||
    uniqueTaskIds.size !== value.taskIds.length
  ) {
    throw new Error("prep task action requires 3-5 unique assignments");
  }
  return {
    ...value,
    completed: value.completed ?? false,
    position: value.position ?? null,
    reasonCount: value.reasonCount ?? 0,
    count: value.taskIds.length,
    minutes: value.taskIds.length * PREP_TASK_MINUTES,
  };
}

function comparePriority(
  left: PrepPositionProgress,
  right: PrepPositionProgress,
): number {
  const rank = (position: PrepPositionProgress) => {
    if (position.errors > 0) return 0;
    if (position.total === 0) return 1;
    if (position.assistedCorrect > 0) return 2;
    if (position.total < PREP_CONFIDENCE_ATTEMPTS) return 3;
    if (position.status !== "confident") return 4;
    return 5;
  };
  return (
    rank(left) - rank(right) ||
    left.readiness - right.readiness ||
    right.errors - left.errors ||
    Date.parse(left.lastAttemptAt ?? "1970-01-01") -
      Date.parse(right.lastAttemptAt ?? "1970-01-01") ||
    left.number - right.number
  );
}

function positionReason(
  position: PrepPositionProgress,
  dayStartMs: number,
): Pick<PrepAction, "reason" | "reasonCount"> {
  if (position.errors > 0) {
    return { reason: "errors", reasonCount: position.errors };
  }
  if (position.assistedCorrect > 0) {
    return { reason: "hints", reasonCount: position.assistedCorrect };
  }
  if (position.total === 0) return { reason: "untested", reasonCount: 0 };
  if (position.total < PREP_CONFIDENCE_ATTEMPTS) {
    return { reason: "lowEvidence", reasonCount: position.total };
  }
  if (isStale(position, dayStartMs)) {
    return { reason: "stale", reasonCount: 7 };
  }
  return { reason: "maintain", reasonCount: 0 };
}

function isStale(position: PrepPositionProgress, dayStartMs: number): boolean {
  return Boolean(
    position.lastAttemptAt &&
    dayStartMs - Date.parse(position.lastAttemptAt) >= 7 * 24 * 60 * 60 * 1000,
  );
}
