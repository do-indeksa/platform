import type { TaskReference } from "@/lib/content";
import type { Attempt } from "@/lib/knowledge";
import {
  actionCompleted,
  buildCoreAction,
  buildSupplementaryAction,
  diagnosticAction,
  settingsAction,
} from "./prep-actions";
import {
  PREP_DEFAULT_TASK_COUNT,
  PREP_MAX_TASK_COUNT,
  PREP_MIN_TASK_COUNT,
  type PrepPlan,
  type PrepPositionDefinition,
  type PrepTopicSlot,
} from "./prep-plan-types";
import {
  buildPositionProgress,
  mapAttemptsToPositions,
} from "./prep-readiness";

export * from "./prep-plan-types";
export { mapAttemptsToPositions } from "./prep-readiness";

type PrepPlanInput = {
  attempts: readonly Attempt[];
  positions: readonly PrepPositionDefinition[];
  topicSlots: readonly PrepTopicSlot[];
  taskReferences: readonly TaskReference[];
  dayStartMs: number;
  dayEndMs: number;
  settingsComplete: boolean;
  practiceTaskCount?: number;
  diagnosticCompleted?: boolean;
  diagnosticCompletedToday?: boolean;
};

export function buildPrepPlan({
  attempts,
  positions,
  topicSlots,
  taskReferences,
  dayStartMs,
  dayEndMs,
  settingsComplete,
  practiceTaskCount = PREP_DEFAULT_TASK_COUNT,
  diagnosticCompleted = false,
  diagnosticCompletedToday = false,
}: PrepPlanInput): PrepPlan {
  const normalizedTaskCount = normalizeTaskCount(practiceTaskCount);
  const mapped = mapAttemptsToPositions(
    attempts,
    positions,
    topicSlots,
    taskReferences,
  );
  const baseline = mapped.filter(
    (attempt) => Date.parse(attempt.at) < dayStartMs,
  );
  const today = mapped.filter((attempt) => {
    const at = Date.parse(attempt.at);
    return at >= dayStartMs && at < dayEndMs;
  });
  const progress = buildPositionProgress(positions, mapped);
  const baselineHasDiagnostic = baseline.some(
    (attempt) => attempt.source === "diagnostic",
  );
  const freshDiagnosticToday =
    !baselineHasDiagnostic &&
    (diagnosticCompletedToday ||
      today.some((attempt) => attempt.source === "diagnostic"));
  const planningAttempts = freshDiagnosticToday
    ? [
        ...baseline,
        ...today.filter((attempt) => attempt.source === "diagnostic"),
      ]
    : baseline;
  const planningProgress = buildPositionProgress(positions, planningAttempts);
  const baselineEstablished =
    baselineHasDiagnostic || diagnosticCompleted || freshDiagnosticToday;
  const core = buildCoreAction(
    planningAttempts,
    planningProgress,
    positions,
    taskReferences,
    dayStartMs,
    baselineEstablished,
    normalizedTaskCount,
  );
  const plannedActions = freshDiagnosticToday
    ? [
        diagnosticAction(
          baseline.length === 0 ? "noData" : "missingBaseline",
          positions.length,
        ),
        core,
        settingsAction(settingsComplete),
      ]
    : [
        core,
        buildSupplementaryAction(
          planningAttempts,
          planningProgress,
          positions,
          taskReferences,
          new Set(core.taskIds),
          normalizedTaskCount,
        ),
        settingsAction(settingsComplete),
      ];
  const actions = plannedActions.map((plannedAction) => ({
    ...plannedAction,
    completed: actionCompleted(
      plannedAction,
      today,
      settingsComplete,
      diagnosticCompletedToday,
    ),
  }));
  const readiness = Math.round(
    progress.reduce((sum, position) => sum + position.readiness, 0) /
      Math.max(progress.length, 1),
  );

  return {
    readiness,
    coveredPositions: progress.filter((position) => position.total > 0).length,
    positions: progress,
    todayActions: actions,
    nextAction:
      actions.find(
        (action) => action.kind !== "settings" && !action.completed,
      ) ??
      actions.find((action) => !action.completed) ??
      null,
  };
}

function normalizeTaskCount(value: number): number {
  if (!Number.isFinite(value)) return PREP_DEFAULT_TASK_COUNT;
  return Math.min(
    PREP_MAX_TASK_COUNT,
    Math.max(PREP_MIN_TASK_COUNT, Math.trunc(value)),
  );
}

export function prepPracticeTaskCount({
  goalPoints,
  maxPoints,
  daysUntilExam,
}: {
  goalPoints: number | null;
  maxPoints: number;
  daysUntilExam: number | null;
}): number {
  if (
    goalPoints === null ||
    daysUntilExam === null ||
    daysUntilExam < 0 ||
    maxPoints <= 0
  ) {
    return PREP_DEFAULT_TASK_COUNT;
  }
  return goalPoints / maxPoints >= 0.75 || daysUntilExam <= 45
    ? PREP_MAX_TASK_COUNT
    : PREP_MIN_TASK_COUNT;
}
