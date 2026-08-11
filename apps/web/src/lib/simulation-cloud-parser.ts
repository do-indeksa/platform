import { validate as isUuid } from "uuid";
import {
  emptySimulationState,
  parsePersistedSimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import {
  progressAttemptId,
  progressRubricAttemptId,
  progressRunItemId,
} from "./progress-run";
import type {
  ProgressCloudCatalog,
  ProgressCloudTask,
} from "./progress-cloud-types";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import type { SimulationTaskView } from "./simulation-types";

const CONTENT_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LOCAL_BLUEPRINT_VERSION_PATTERN = /^\d{4}\.\d+$/;
const CLIENT_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_SERIALIZED_ANSWER_LENGTH = 8_192;

export type SimulationCloudTask = ProgressCloudTask & {
  examPosition: number;
  maxPoints: number;
};

export type SimulationCloudRuntime = {
  runId: string;
  runOwnerId: string;
  checkpointVersion: number;
  blueprintVersion: string;
  contentRevision: string;
  tasks: SimulationCloudTask[];
  answers: string[][];
  skipped: boolean[];
  rubricScores: (number | null)[];
  phase: "running" | "submitting";
  startedAt: number;
  endsAt: number;
  submittedAt: number | null;
  currentIndex: number;
  savedAt: number | null;
  timedOut: boolean;
};

export type SimulationCloudRun = {
  runtime: SimulationCloudRuntime;
  checkpointUpdatedAt: string | null;
};

export function parseActiveSimulationRunIds(
  value: unknown,
  limit: number,
): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const activeIds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isUuidString(candidate.id) ||
      seen.has(candidate.id) ||
      !isRunKind(candidate.kind) ||
      !isRunStatus(candidate.status) ||
      !isRemoteTime(candidate.startedAt)
    ) {
      return null;
    }
    seen.add(candidate.id);
    if (candidate.kind === "SIMULATION" && candidate.status === "ACTIVE") {
      activeIds.push(candidate.id);
    }
  }
  return activeIds;
}

export function parseSimulationCloudRun(
  value: unknown,
  catalog: ProgressCloudCatalog,
  ownerId: string,
): SimulationCloudRun | null {
  const blueprintVersion = localBlueprintVersion(catalog.blueprintVersion);
  if (
    !validCatalog(catalog) ||
    blueprintVersion === null ||
    !isRecord(value) ||
    !isUuid(ownerId) ||
    !isUuidString(value.id) ||
    value.kind !== "SIMULATION" ||
    value.status !== "ACTIVE" ||
    value.blueprintVersion !== catalog.blueprintVersion ||
    typeof value.contentRevision !== "string" ||
    !CONTENT_REVISION_PATTERN.test(value.contentRevision) ||
    !isRemoteTime(value.startedAt) ||
    !isOptionalRemoteTime(value.deadlineAt) ||
    (value.submittedAt !== null && value.submittedAt !== undefined) ||
    !Array.isArray(value.items) ||
    value.items.length !== catalog.taskCount
  ) {
    return null;
  }

  const startedAt = Date.parse(value.startedAt);
  const expectedEndsAt = startedAt + catalog.durationMinutes * 60_000;
  if (
    (typeof value.deadlineAt === "string" &&
      Date.parse(value.deadlineAt) !== expectedEndsAt) ||
    !isOptionalDuration(value.activeDurationMs, startedAt)
  ) {
    return null;
  }

  const tasks: SimulationCloudTask[] = [];
  const attempts: (ParsedAttempt | null)[] = [];
  const runItemIds: string[] = [];
  const seenTasks = new Set<string>();
  let attemptGap = false;
  let attemptCount = 0;
  let submissionAt: number | null = null;

  for (const [index, rawItem] of value.items.entries()) {
    const position = catalog.positions[index];
    if (
      position?.ordinal !== index + 1 ||
      !isRecord(rawItem) ||
      rawItem.ordinal !== index + 1 ||
      rawItem.examPosition !== position.examPosition ||
      rawItem.maxPoints !== position.maxPoints ||
      typeof rawItem.taskId !== "string"
    ) {
      return null;
    }
    const task = position.candidates.find(
      (candidate) => candidate.id === rawItem.taskId,
    );
    const runItemId = task ? progressRunItemId(value.id, task.id) : null;
    if (
      task === undefined ||
      seenTasks.has(task.id) ||
      rawItem.id !== runItemId ||
      rawItem.topic !== task.topic ||
      rawItem.taskRevision !== task.revision ||
      !Array.isArray(rawItem.recentAttempts) ||
      rawItem.recentAttempts.length > 2
    ) {
      return null;
    }
    seenTasks.add(task.id);
    const resolvedTask = {
      ...task,
      examPosition: position.examPosition,
      maxPoints: position.maxPoints,
    };
    tasks.push(resolvedTask);
    runItemIds.push(runItemId as string);

    if (rawItem.recentAttempts.length === 0) {
      attemptGap = true;
      attempts.push(null);
      continue;
    }
    if (attemptGap) return null;
    const parsedAttempts = rawItem.recentAttempts.map((rawAttempt) =>
      parseAttempt(rawAttempt, runItemId as string, resolvedTask, startedAt),
    );
    if (parsedAttempts.some((attempt) => attempt === null)) return null;
    const concrete = parsedAttempts as ParsedAttempt[];
    const auto = concrete.find((attempt) => attempt.kind === "auto");
    const rubric = concrete.find((attempt) => attempt.kind === "rubric");
    if (
      (concrete.length === 2 && (auto === undefined || rubric === undefined)) ||
      (auto !== undefined &&
        rubric !== undefined &&
        (!sameValues(auto.answers, rubric.answers) ||
          auto.skipped !== rubric.skipped ||
          auto.submittedAt !== rubric.submittedAt))
    ) {
      return null;
    }
    const attempt = rubric ?? auto;
    if (
      attempt === undefined ||
      (submissionAt !== null && submissionAt !== attempt.submittedAt)
    ) {
      return null;
    }
    submissionAt = attempt.submittedAt;
    attemptCount += 1;
    attempts.push(attempt);
  }

  const checkpoint = parseCheckpoint(
    value.checkpoint,
    tasks,
    runItemIds,
    startedAt,
  );
  if (checkpoint === null) return null;
  if (
    attemptCount > 0 &&
    attemptCount < tasks.length &&
    checkpoint.version === 0
  ) {
    return null;
  }
  const answers = tasks.map(emptyAnswers);
  const skipped = Array<boolean>(tasks.length).fill(false);
  const rubricScores = Array<number | null>(tasks.length).fill(null);
  for (const [index, draft] of checkpoint.drafts.entries()) {
    if (draft === null) continue;
    answers[index] = draft.answers;
    skipped[index] = draft.answers.every((answer) => answer === "");
    rubricScores[index] = draft.rubricScore;
  }
  for (const [index, attempt] of attempts.entries()) {
    if (attempt === null) continue;
    const draft = checkpoint.drafts[index];
    if (
      draft !== null &&
      (!sameValues(draft.answers, attempt.answers) ||
        skipped[index] !== attempt.skipped ||
        (draft.rubricScore !== null &&
          attempt.rubricScore !== null &&
          draft.rubricScore !== attempt.rubricScore))
    ) {
      return null;
    }
    answers[index] = attempt.answers;
    skipped[index] = attempt.skipped;
    rubricScores[index] = attempt.rubricScore ?? rubricScores[index];
  }

  const phase = attemptCount > 0 ? "submitting" : "running";
  const currentIndex =
    checkpoint.currentIndex ??
    Math.min(Math.max(attemptCount - 1, 0), tasks.length - 1);
  return {
    runtime: {
      runId: value.id,
      runOwnerId: ownerId,
      checkpointVersion: checkpoint.version,
      blueprintVersion,
      contentRevision: value.contentRevision,
      tasks,
      answers,
      skipped,
      rubricScores: rubricScores.some((score) => score !== null)
        ? rubricScores
        : [],
      phase,
      startedAt,
      endsAt: expectedEndsAt,
      submittedAt: phase === "submitting" ? submissionAt : null,
      currentIndex,
      savedAt: checkpoint.updatedAt,
      timedOut:
        phase === "submitting" &&
        submissionAt !== null &&
        submissionAt >= expectedEndsAt,
    },
    checkpointUpdatedAt: checkpoint.updatedAtIso,
  };
}

export function materializeSimulationCloudRun(
  cloud: SimulationCloudRun,
  blueprintVersion: string,
  contentRevision: string,
  tasks: readonly SimulationTaskView[],
): PersistedSimulationState | null {
  const remote = cloud.runtime;
  if (
    remote.blueprintVersion !== blueprintVersion ||
    remote.contentRevision !== contentRevision ||
    tasks.length !== remote.tasks.length ||
    !tasks.every((task, index) => sameTaskView(task, remote.tasks[index]))
  ) {
    return null;
  }
  const parsed = parsePersistedSimulationState({
    ...emptySimulationState(),
    runId: remote.runId,
    runOwnerId: remote.runOwnerId,
    checkpointVersion: remote.checkpointVersion,
    blueprintVersion: remote.blueprintVersion,
    contentRevision: remote.contentRevision,
    tasks,
    answers: remote.answers,
    skipped: remote.skipped,
    rubricScores: remote.rubricScores,
    phase: remote.phase,
    startedAt: remote.startedAt,
    endsAt: remote.endsAt,
    submittedAt: remote.submittedAt,
    currentIndex: remote.currentIndex,
    savedAt: remote.savedAt,
    timedOut: remote.timedOut,
  });
  return parsed.phase === remote.phase ? parsed : null;
}

type ParsedCheckpoint = {
  version: number;
  currentIndex: number | null;
  updatedAt: number | null;
  updatedAtIso: string | null;
  drafts: (ParsedCheckpointDraft | null)[];
};

type ParsedCheckpointDraft = {
  answers: string[];
  rubricScore: number | null;
};

function parseCheckpoint(
  value: unknown,
  tasks: SimulationCloudTask[],
  runItemIds: string[],
  startedAt: number,
): ParsedCheckpoint | null {
  if (value === null || value === undefined) {
    return {
      version: 0,
      currentIndex: null,
      updatedAt: null,
      updatedAtIso: null,
      drafts: Array<null>(tasks.length).fill(null),
    };
  }
  if (
    !isRecord(value) ||
    !isPositiveVersion(value.version) ||
    !Number.isInteger(value.currentOrdinal) ||
    (value.currentOrdinal as number) < 1 ||
    (value.currentOrdinal as number) > tasks.length ||
    !isOptionalDuration(value.activeDurationMs, startedAt) ||
    !isRemoteTime(value.updatedAt) ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > tasks.length
  ) {
    return null;
  }
  const drafts = Array<ParsedCheckpointDraft | null>(tasks.length).fill(null);
  for (const rawDraft of value.drafts) {
    if (!isRecord(rawDraft) || typeof rawDraft.runItemId !== "string") {
      return null;
    }
    const index = runItemIds.indexOf(rawDraft.runItemId);
    if (index < 0 || drafts[index] !== null) return null;
    const draft = parseCheckpointDraft(rawDraft.answer, tasks[index]);
    if (draft === null) return null;
    drafts[index] = draft;
  }
  return {
    version: value.version,
    currentIndex: (value.currentOrdinal as number) - 1,
    updatedAt: Date.parse(value.updatedAt),
    updatedAtIso: value.updatedAt,
    drafts,
  };
}

function parseCheckpointDraft(
  value: unknown,
  task: Pick<SimulationCloudTask, "answerPartCount" | "maxPoints">,
): ParsedCheckpointDraft | null {
  const parsed = parseSerializedAnswer(value);
  if (parsed === null) return null;
  if (Array.isArray(parsed)) {
    const answers = parseAnswerParts(parsed, task.answerPartCount);
    return answers === null ? null : { answers, rubricScore: null };
  }
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).toSorted().join(",") !==
      "answers,rubricScore,version" ||
    parsed.version !== 1 ||
    (parsed.rubricScore !== null &&
      !isIntegerBetween(parsed.rubricScore, 0, task.maxPoints - 1))
  ) {
    return null;
  }
  const answers = parseAnswerParts(parsed.answers, task.answerPartCount);
  return answers === null
    ? null
    : { answers, rubricScore: parsed.rubricScore as number | null };
}

type ParsedAttempt = {
  kind: "auto" | "rubric";
  answers: string[];
  skipped: boolean;
  submittedAt: number;
  rubricScore: number | null;
};

function parseAttempt(
  value: unknown,
  runItemId: string,
  task: SimulationCloudTask,
  runStartedAt: number,
): ParsedAttempt | null {
  if (
    !isRecord(value) ||
    value.runItemId !== runItemId ||
    value.taskId !== task.id ||
    value.examPosition !== task.examPosition ||
    value.mode !== "SIMULATION" ||
    value.helpLevel !== 0 ||
    (value.gradingKind !== "AUTO" && value.gradingKind !== "RUBRIC_SELF") ||
    value.taskRevision !== task.revision ||
    value.maxPoints !== task.maxPoints ||
    !isRemoteTime(value.startedAt) ||
    Date.parse(value.startedAt) !== runStartedAt ||
    !isRemoteTime(value.submittedAt) ||
    !isOptionalDuration(value.activeDurationMs, runStartedAt)
  ) {
    return null;
  }
  const rubric = value.gradingKind === "RUBRIC_SELF";
  if (
    value.id !==
    (rubric ? progressRubricAttemptId(runItemId) : progressAttemptId(runItemId))
  ) {
    return null;
  }
  const submittedAt = Date.parse(value.submittedAt);
  if (submittedAt < runStartedAt) return null;
  if (value.outcome === "SKIPPED") {
    if (
      (value.answer !== null && value.answer !== undefined) ||
      (value.earnedPoints !== null && value.earnedPoints !== undefined)
    ) {
      return null;
    }
    return {
      kind: rubric ? "rubric" : "auto",
      answers: emptyAnswers(task),
      skipped: true,
      submittedAt,
      rubricScore: rubric ? 0 : null,
    };
  }
  if (
    (!rubric && value.outcome !== "CORRECT" && value.outcome !== "INCORRECT") ||
    (rubric && value.outcome !== "PARTIAL" && value.outcome !== "INCORRECT")
  ) {
    return null;
  }
  const answers = parseAnswers(value.answer, task.answerPartCount);
  const validPoints = rubric
    ? value.outcome === "PARTIAL"
      ? isIntegerBetween(value.earnedPoints, 1, task.maxPoints - 1)
      : value.earnedPoints === 0
    : value.earnedPoints === (value.outcome === "CORRECT" ? task.maxPoints : 0);
  return answers === null || !validPoints
    ? null
    : {
        kind: rubric ? "rubric" : "auto",
        answers,
        skipped: answers.every((answer) => answer === ""),
        submittedAt,
        rubricScore: rubric ? (value.earnedPoints as number) : null,
      };
}

function parseAnswers(value: unknown, partCount: number): string[] | null {
  const parsed = parseSerializedAnswer(value);
  return parsed === null ? null : parseAnswerParts(parsed, partCount);
}

function parseSerializedAnswer(value: unknown): unknown | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_SERIALIZED_ANSWER_LENGTH
  ) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseAnswerParts(value: unknown, partCount: number): string[] | null {
  return Array.isArray(value) &&
    value.length === partCount &&
    value.every(
      (answer) =>
        typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
    )
    ? [...value]
    : null;
}

function sameTaskView(
  task: SimulationTaskView,
  remote: SimulationCloudTask,
): boolean {
  return (
    task.id === remote.id &&
    task.revision === remote.revision &&
    task.slot === remote.slot &&
    task.examPosition === remote.examPosition &&
    task.maxPoints === remote.maxPoints &&
    task.topic === remote.topic &&
    task.fields.length === remote.answerPartCount
  );
}

function validCatalog(catalog: ProgressCloudCatalog): boolean {
  return (
    Number.isSafeInteger(catalog.durationMinutes) &&
    catalog.durationMinutes > 0 &&
    Number.isSafeInteger(catalog.taskCount) &&
    catalog.taskCount > 0 &&
    catalog.taskCount <= 20 &&
    catalog.positions.length === catalog.taskCount
  );
}

function localBlueprintVersion(value: string): string | null {
  const separator = value.lastIndexOf(":");
  const version = separator < 0 ? "" : value.slice(separator + 1);
  return LOCAL_BLUEPRINT_VERSION_PATTERN.test(version) ? version : null;
}

function emptyAnswers(task: Pick<ProgressCloudTask, "answerPartCount">) {
  return Array<string>(task.answerPartCount).fill("");
}

function isRemoteTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) &&
    timestamp > 0 &&
    timestamp <= Date.now() + CLIENT_CLOCK_SKEW_MS
  );
}

function isOptionalRemoteTime(value: unknown): boolean {
  return value === null || value === undefined || isRemoteTime(value);
}

function isOptionalDuration(value: unknown, startedAt: number): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= Date.now() + CLIENT_CLOCK_SKEW_MS - startedAt)
  );
}

function isPositiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isIntegerBetween(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

function isRunKind(value: unknown): boolean {
  return (
    value === "PRACTICE" || value === "DIAGNOSTIC" || value === "SIMULATION"
  );
}

function isRunStatus(value: unknown): boolean {
  return value === "ACTIVE" || value === "SUBMITTED" || value === "ABANDONED";
}

function sameValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
