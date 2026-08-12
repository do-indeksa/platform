export const PREP_READINESS_WINDOW = 5;
export const PREP_CONFIDENCE_ATTEMPTS = 3;
export const PREP_ASSISTED_CORRECT_WEIGHT = 0.75;
export const PREP_DIAGNOSTIC_MINUTES = 25;
export const PREP_TASK_MINUTES = 5;
export const PREP_DEFAULT_TASK_COUNT = 3;
export const PREP_LIGHT_TASK_COUNT = 2;

export type PrepPositionDefinition = {
  number: number;
  name: string;
  description?: string;
  topicSlugs: string[];
};

export type PrepTopicSlot = {
  slug: string;
  slot: number;
};

export type PrepPositionStatus =
  "untested" | "starting" | "needsWork" | "progressing" | "confident";

export type PrepPositionProgress = PrepPositionDefinition & {
  correct: number;
  total: number;
  errors: number;
  assistedCorrect: number;
  readiness: number;
  status: PrepPositionStatus;
  lastAttemptAt: string | null;
};

export type PrepActionKind =
  "diagnostic" | "practice" | "review" | "check" | "settings";

export type PrepActionReason =
  | "noData"
  | "missingBaseline"
  | "errors"
  | "hints"
  | "untested"
  | "lowEvidence"
  | "stale"
  | "maintain"
  | "recentErrors"
  | "preferences";

export type PrepAction = {
  id: string;
  kind: PrepActionKind;
  position: number | null;
  taskIds: string[];
  count: number;
  minutes: number;
  reason: PrepActionReason;
  reasonCount: number;
  completed: boolean;
};

export type PrepPlan = {
  readiness: number;
  coveredPositions: number;
  positions: PrepPositionProgress[];
  todayActions: PrepAction[];
  nextAction: PrepAction | null;
};
