import type { TaskReference } from "@/lib/content";
import type { Attempt } from "@/lib/knowledge";
import {
  PREP_ASSISTED_CORRECT_WEIGHT,
  PREP_CONFIDENCE_ATTEMPTS,
  PREP_READINESS_WINDOW,
  type PrepPositionDefinition,
  type PrepPositionProgress,
  type PrepPositionStatus,
  type PrepTopicSlot,
} from "./prep-plan-types";

export type MappedAttempt = Attempt & { position: number };

export function mapAttemptsToPositions(
  attempts: readonly Attempt[],
  positions: readonly PrepPositionDefinition[],
  topicSlots: readonly PrepTopicSlot[],
  taskReferences: readonly TaskReference[],
): MappedAttempt[] {
  const positionByTopic = new Map<string, number>();
  for (const position of positions) {
    for (const topic of position.topicSlugs) {
      positionByTopic.set(topic, position.number);
    }
  }
  const topicByTask = new Map(
    taskReferences.map((task) => [task.id, task.topic] as const),
  );
  const legacyTopicBySlot = new Map(
    topicSlots.map((topic) => [topic.slot, topic.slug] as const),
  );

  return attempts
    .flatMap((attempt): MappedAttempt[] => {
      const topic =
        topicByTask.get(attempt.taskId) ?? legacyTopicBySlot.get(attempt.slot);
      const position = topic ? positionByTopic.get(topic) : undefined;
      return position === undefined || Number.isNaN(Date.parse(attempt.at))
        ? []
        : [{ ...attempt, position }];
    })
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function buildPositionProgress(
  definitions: readonly PrepPositionDefinition[],
  attempts: readonly MappedAttempt[],
): PrepPositionProgress[] {
  return definitions.map((definition) => {
    const recent = attempts
      .filter((attempt) => attempt.position === definition.number)
      .slice(-PREP_READINESS_WINDOW);
    const correct = recent.filter((attempt) => attempt.correct).length;
    const assistedCorrect = recent.filter(
      (attempt) => attempt.correct && attempt.helpLevel > 0,
    ).length;
    const weightedCorrect = recent.reduce(
      (sum, attempt) =>
        sum +
        (attempt.correct
          ? attempt.helpLevel > 0
            ? PREP_ASSISTED_CORRECT_WEIGHT
            : 1
          : 0),
      0,
    );
    const readiness = Math.round(
      (weightedCorrect / Math.max(PREP_CONFIDENCE_ATTEMPTS, recent.length)) *
        100,
    );

    return {
      ...definition,
      correct,
      total: recent.length,
      errors: recent.length - correct,
      assistedCorrect,
      readiness,
      status: positionStatus(recent.length, readiness),
      lastAttemptAt: recent.at(-1)?.at ?? null,
    };
  });
}

function positionStatus(
  attempts: number,
  readiness: number,
): PrepPositionStatus {
  if (attempts === 0) return "untested";
  if (attempts < PREP_CONFIDENCE_ATTEMPTS) return "starting";
  if (readiness >= 80) return "confident";
  if (readiness >= 50) return "progressing";
  return "needsWork";
}
