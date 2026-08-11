import type { CheckKind } from "./answer";
import {
  isSimulationBlueprintVersion,
  isSimulationRunId,
  isSimulationTaskId,
} from "./simulation-run";
import {
  migrateLegacySimulationHistory,
  parseSimulationHistory,
} from "./simulation-history-persistence";
import { isLearningRunOwner } from "./learning-run-owner";
import { normalizeSimulationRubricScores } from "./simulation-rubric";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  SIMULATION_MAX_ANSWER_PARTS,
  SIMULATION_MAX_RENDERED_HTML_LENGTH,
  SIMULATION_MAX_TASKS,
  parseSimulationReviewItems,
  type SimulationGradeItem,
  type SimulationHistoryEntry,
  type SimulationPhase,
  type SimulationReviewItem,
  type SimulationTaskView,
} from "./simulation-types";

export { SIMULATION_HISTORY_LIMIT } from "./simulation-history-persistence";

export type PersistedSimulationState = {
  runId: string | null;
  runOwnerId: string | null;
  checkpointVersion: number;
  blueprintVersion: string | null;
  contentRevision: string | null;
  tasks: SimulationTaskView[];
  answers: string[][];
  skipped: boolean[];
  phase: SimulationPhase | null;
  startedAt: number | null;
  endsAt: number | null;
  submittedAt: number | null;
  currentIndex: number;
  savedAt: number | null;
  timedOut: boolean;
  results: SimulationGradeItem[];
  review: SimulationReviewItem[];
  rubricScores: (number | null)[];
  history: SimulationHistoryEntry[];
};

const CHECK_KINDS = new Set<CheckKind>(["value", "values", "interval", "text"]);
const TOPIC_PATTERN = /^[a-z0-9-]{1,64}$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_HTML_LENGTH = SIMULATION_MAX_RENDERED_HTML_LENGTH;

export function emptySimulationState(
  history: SimulationHistoryEntry[] = [],
): PersistedSimulationState {
  return {
    runId: null,
    runOwnerId: null,
    checkpointVersion: 0,
    blueprintVersion: null,
    contentRevision: null,
    tasks: [],
    answers: [],
    skipped: [],
    phase: null,
    startedAt: null,
    endsAt: null,
    submittedAt: null,
    currentIndex: 0,
    savedAt: null,
    timedOut: false,
    results: [],
    review: [],
    rubricScores: [],
    history,
  };
}

export function migrateSimulationState(
  value: unknown,
  version: number,
): PersistedSimulationState {
  if (version < 5) {
    return emptySimulationState(migrateLegacySimulationHistory(value));
  }
  if (version < 6) {
    const history = isRecord(value)
      ? parseSimulationHistory(value.history)
      : [];
    return emptySimulationState(history);
  }
  if (version < 8) {
    const legacy = isRecord(value)
      ? parsePersistedSimulationState({ ...value, runOwnerId: null })
      : emptySimulationState();
    return emptySimulationState(legacy.history);
  }
  if ((version === 8 || version === 9) && isRecord(value)) {
    const resultCount = Array.isArray(value.results) ? value.results.length : 0;
    return parsePersistedSimulationState({
      ...value,
      ...(version === 8 ? { checkpointVersion: 0 } : {}),
      ...(value.phase === "submitting"
        ? { phase: "running", submittedAt: null, timedOut: false }
        : {}),
      rubricScores:
        value.phase === "done" ? Array<null>(resultCount).fill(null) : [],
    });
  }
  return parsePersistedSimulationState(value);
}

export function parsePersistedSimulationState(
  value: unknown,
): PersistedSimulationState {
  if (!isRecord(value)) return emptySimulationState();
  const history = parseSimulationHistory(value.history);
  if (value.phase === null) return emptySimulationState(history);
  const rubricScores =
    value.rubricScores === undefined
      ? value.phase === "done" && Array.isArray(value.results)
        ? Array<null>(value.results.length).fill(null)
        : []
      : value.rubricScores;
  if (
    !isSimulationRunId(value.runId) ||
    !isLearningRunOwner(value.runOwnerId) ||
    !isSimulationCheckpointVersion(value.checkpointVersion) ||
    !isSimulationBlueprintVersion(value.blueprintVersion) ||
    !isRevision(value.contentRevision) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1 ||
    value.tasks.length > SIMULATION_MAX_TASKS ||
    !value.tasks.every(isTaskView) ||
    !hasCanonicalTaskOrder(value.tasks) ||
    !isAnswers(value.answers, value.tasks) ||
    !isSkipped(value.skipped, value.answers) ||
    (value.phase !== "running" &&
      value.phase !== "submitting" &&
      value.phase !== "reviewing" &&
      value.phase !== "done") ||
    !isTimestamp(value.startedAt) ||
    !Number.isInteger(value.currentIndex) ||
    (value.currentIndex as number) < 0 ||
    (value.currentIndex as number) >= value.tasks.length ||
    !isOptionalTimestamp(value.savedAt) ||
    typeof value.timedOut !== "boolean" ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.review) ||
    !Array.isArray(rubricScores)
  ) {
    return emptySimulationState(history);
  }

  const tasks = value.tasks as SimulationTaskView[];
  const active =
    value.phase === "running" ||
    value.phase === "submitting" ||
    value.phase === "reviewing";
  const grade = isGradeItems(value.results, tasks)
    ? (value.results as SimulationGradeItem[])
    : null;
  const review = parseSimulationReviewItems(value.review, tasks);
  if (
    (active && !isTimestamp(value.endsAt)) ||
    (active && (value.endsAt as number) <= (value.startedAt as number)) ||
    (value.phase === "running" && value.submittedAt !== null) ||
    (value.phase !== "running" && !isTimestamp(value.submittedAt)) ||
    ((value.phase === "running" || value.phase === "submitting") &&
      value.results.length !== 0) ||
    ((value.phase === "running" || value.phase === "submitting") &&
      value.review.length !== 0) ||
    (value.phase === "running" && rubricScores.length !== 0) ||
    (value.phase === "submitting" &&
      !isPendingRubricScores(rubricScores, tasks)) ||
    (value.phase === "running" && value.timedOut) ||
    (value.phase === "reviewing" &&
      (grade === null ||
        review === null ||
        normalizeSimulationRubricScores(grade, review, rubricScores) ===
          null)) ||
    (value.phase === "done" && value.endsAt !== null) ||
    (value.phase === "done" &&
      (grade === null ||
        review === null ||
        !isFinalRubricState(grade, review, rubricScores)))
  ) {
    return emptySimulationState(history);
  }

  return {
    runId: value.runId,
    runOwnerId: value.runOwnerId,
    checkpointVersion: value.checkpointVersion,
    blueprintVersion: value.blueprintVersion,
    contentRevision: value.contentRevision,
    tasks: tasks.map(cloneTask),
    answers: (value.answers as string[][]).map((answers) => [...answers]),
    skipped: [...(value.skipped as boolean[])],
    phase: value.phase,
    startedAt: value.startedAt,
    endsAt: active ? (value.endsAt as number) : null,
    submittedAt:
      value.phase === "running" ? null : (value.submittedAt as number),
    currentIndex: value.currentIndex as number,
    savedAt: value.savedAt as number | null,
    timedOut: value.timedOut,
    results:
      value.phase === "reviewing" || value.phase === "done"
        ? (grade as SimulationGradeItem[]).map((item) => ({ ...item }))
        : [],
    review:
      value.phase === "reviewing" || value.phase === "done"
        ? (review as SimulationReviewItem[]).map(cloneReviewItem)
        : [],
    rubricScores:
      value.phase === "running"
        ? []
        : (rubricScores as (number | null)[]).map((score) => score),
    history,
  };
}

export function isSimulationCheckpointVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTaskView(value: unknown): value is SimulationTaskView {
  if (!isRecord(value)) return false;
  return (
    isSimulationTaskId(value.id) &&
    isRevision(value.revision) &&
    isFiniteInteger(value.slot, 1, 10) &&
    isFiniteInteger(value.examPosition, 1, SIMULATION_MAX_TASKS) &&
    isFiniteInteger(value.maxPoints, 1, 1_000) &&
    typeof value.topic === "string" &&
    TOPIC_PATTERN.test(value.topic) &&
    isBoundedString(value.topicName, 200) &&
    isBoundedString(value.statementHtml, MAX_HTML_LENGTH) &&
    Array.isArray(value.fields) &&
    value.fields.length >= 1 &&
    value.fields.length <= SIMULATION_MAX_ANSWER_PARTS &&
    value.fields.every(isField)
  );
}

function isField(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  return (
    CHECK_KINDS.has(value.kind as CheckKind) &&
    (value.label === undefined || isBoundedString(value.label, 100))
  );
}

function hasCanonicalTaskOrder(tasks: SimulationTaskView[]): boolean {
  return (
    new Set(tasks.map((task) => task.id)).size === tasks.length &&
    tasks.every((task, index) => task.examPosition === index + 1)
  );
}

function isAnswers(value: unknown, tasks: SimulationTaskView[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === tasks.length &&
    value.every(
      (answers, index) =>
        Array.isArray(answers) &&
        answers.length === tasks[index].fields.length &&
        answers.every(
          (answer) =>
            typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
        ),
    )
  );
}

function isSkipped(value: unknown, answers: unknown): boolean {
  return (
    Array.isArray(value) &&
    Array.isArray(answers) &&
    value.length === answers.length &&
    value.every(
      (skipped, index) =>
        typeof skipped === "boolean" &&
        (!skipped ||
          (answers[index] as unknown[]).every(
            (answer) => typeof answer === "string" && answer.trim() === "",
          )),
    )
  );
}

function isGradeItems(
  value: unknown,
  tasks: SimulationTaskView[],
): value is SimulationGradeItem[] {
  return (
    Array.isArray(value) &&
    value.length === tasks.length &&
    value.every((item, index) => {
      if (!isRecord(item)) return false;
      const task = tasks[index];
      return (
        item.taskId === task.id &&
        (item.outcome === "correct" ||
          item.outcome === "partial" ||
          item.outcome === "incorrect" ||
          item.outcome === "unanswered") &&
        isFiniteInteger(item.earnedPoints, 0, task.maxPoints) &&
        item.maxPoints === task.maxPoints &&
        (item.outcome === "correct"
          ? item.earnedPoints === task.maxPoints
          : item.outcome === "partial"
            ? item.earnedPoints > 0 && item.earnedPoints < task.maxPoints
            : item.earnedPoints === 0)
      );
    })
  );
}

function isPendingRubricScores(
  value: unknown[],
  tasks: SimulationTaskView[],
): boolean {
  return (
    value.length === 0 ||
    (value.length === tasks.length &&
      value.every(
        (score, index) =>
          score === null ||
          isFiniteInteger(score, 0, tasks[index].maxPoints - 1),
      ))
  );
}

function isFinalRubricState(
  results: SimulationGradeItem[],
  review: SimulationReviewItem[],
  scores: unknown[],
): boolean {
  if (scores.length !== results.length) return false;
  return results.every((result, index) => {
    const score = scores[index];
    const rubricMax = review[index].rubric.reduce(
      (sum, criterion) => sum + criterion.points,
      0,
    );
    const eligible = result.outcome !== "correct" && rubricMax > 0;
    if (score === null) return !eligible && result.outcome !== "partial";
    if (
      !isFiniteInteger(score, 0, rubricMax) ||
      result.outcome === "correct" ||
      rubricMax >= result.maxPoints
    ) {
      return false;
    }
    return score === 0
      ? result.outcome === "incorrect" || result.outcome === "unanswered"
      : result.outcome === "partial" && result.earnedPoints === score;
  });
}

function cloneReviewItem(item: SimulationReviewItem): SimulationReviewItem {
  return {
    ...item,
    rubric: item.rubric.map((criterion) => ({ ...criterion })),
  };
}

function cloneTask(task: SimulationTaskView): SimulationTaskView {
  return {
    id: task.id,
    revision: task.revision,
    slot: task.slot,
    examPosition: task.examPosition,
    maxPoints: task.maxPoints,
    topic: task.topic,
    topicName: task.topicName,
    statementHtml: task.statementHtml,
    fields: task.fields.map((field) => ({
      kind: field.kind,
      ...(field.label === undefined ? {} : { label: field.label }),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isOptionalTimestamp(value: unknown): value is number | null {
  return value === null || isTimestamp(value);
}

function isFiniteInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}
