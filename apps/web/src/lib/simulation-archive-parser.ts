import {
  isSimulationBlueprintVersion,
  isSimulationRunId,
  isSimulationTaskId,
} from "./simulation-run";
import { MAX_ANSWER_LENGTH } from "./task-draft";
import {
  SIMULATION_MAX_ANSWER_PARTS,
  SIMULATION_MAX_TASKS,
  type SimulationGradeItem,
  type SimulationHistoryEntry,
} from "./simulation-types";
import type {
  SimulationArchiveOutcome,
  SimulationArchiveRun,
} from "./simulation-archive";

const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOPIC_PATTERN = /^[a-z0-9-]{1,64}$/;
const BLUEPRINT_PREFIX = "ftn-p1:";
const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;

type ParsedItem = {
  taskId: string;
  taskRevision: string;
  outcome: SimulationArchiveOutcome;
  earnedPoints: number | null;
  maxPoints: number;
  answers: string[];
  reviewable: boolean;
};

export function parseSimulationArchiveResponse(
  value: unknown,
  limit: number,
): SimulationArchiveRun[] | null {
  if (!isRecord(value)) return null;
  if (
    value.errors !== undefined &&
    (!Array.isArray(value.errors) || value.errors.length > 0)
  ) {
    return null;
  }
  if (!isRecord(value.data)) return null;
  const runs = value.data.completedSimulationRuns;
  if (!Array.isArray(runs) || runs.length > limit) return null;

  const parsed: SimulationArchiveRun[] = [];
  const runIds = new Set<string>();
  for (const run of runs) {
    const entry = parseRun(run);
    if (entry === null || runIds.has(entry.id)) return null;
    runIds.add(entry.id);
    parsed.push(entry);
  }
  return parsed;
}

function parseRun(value: unknown): SimulationArchiveRun | null {
  if (!isRecord(value) || !isSimulationRunId(value.id)) return null;
  if (
    typeof value.blueprintVersion !== "string" ||
    !value.blueprintVersion.startsWith(BLUEPRINT_PREFIX)
  ) {
    return null;
  }
  const blueprintVersion = value.blueprintVersion.slice(
    BLUEPRINT_PREFIX.length,
  );
  if (
    !isSimulationBlueprintVersion(blueprintVersion) ||
    typeof value.contentRevision !== "string" ||
    !REVISION_PATTERN.test(value.contentRevision)
  ) {
    return null;
  }

  const startedAt = timestamp(value.startedAt);
  const finishedAt = timestamp(value.submittedAt);
  const deadlineAt =
    value.deadlineAt === null ? null : timestamp(value.deadlineAt);
  if (
    startedAt === null ||
    finishedAt === null ||
    finishedAt < startedAt ||
    (deadlineAt === null && value.deadlineAt !== null) ||
    !integer(value.activeDurationMs, 0, MAX_DURATION_MS) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > SIMULATION_MAX_TASKS
  ) {
    return null;
  }

  const items: ParsedItem[] = [];
  const taskIds = new Set<string>();
  for (const [index, rawItem] of value.items.entries()) {
    const item = parseItem(rawItem, index + 1);
    if (item === null || taskIds.has(item.taskId)) return null;
    taskIds.add(item.taskId);
    items.push(item);
  }
  const maxPoints = items.reduce((sum, item) => sum + item.maxPoints, 0);
  if (maxPoints < 1 || maxPoints > 60) return null;

  const scoreKnown = items.every(({ earnedPoints }) => earnedPoints !== null);
  const score = scoreKnown
    ? items.reduce((sum, item) => sum + (item.earnedPoints ?? 0), 0)
    : null;
  const compatible = items.every(
    ({ outcome, reviewable }) =>
      reviewable && outcome !== "partial" && outcome !== "ungraded",
  );
  const historyEntry = compatible
    ? buildHistoryEntry(
        value.id,
        blueprintVersion,
        value.contentRevision,
        startedAt,
        finishedAt,
        value.activeDurationMs,
        deadlineAt,
        items,
        score ?? 0,
        maxPoints,
      )
    : null;

  return {
    id: value.id,
    blueprintVersion,
    startedAt,
    finishedAt,
    durationMs: value.activeDurationMs,
    timedOut: deadlineAt !== null && finishedAt >= deadlineAt,
    score,
    maxPoints,
    correctCount: items.filter(({ outcome }) => outcome === "correct").length,
    answeredCount: items.filter(({ outcome }) => outcome !== "unanswered")
      .length,
    taskIds: items.map(({ taskId }) => taskId),
    outcomes: items.map(({ outcome }) => outcome),
    historyEntry,
  };
}

function parseItem(
  value: unknown,
  expectedPosition: number,
): ParsedItem | null {
  if (
    !isRecord(value) ||
    !isSimulationTaskId(value.taskId) ||
    value.examPosition !== expectedPosition ||
    typeof value.topic !== "string" ||
    !TOPIC_PATTERN.test(value.topic) ||
    !integer(value.maxPoints, 1, 60) ||
    typeof value.taskRevision !== "string" ||
    !REVISION_PATTERN.test(value.taskRevision)
  ) {
    return null;
  }
  const base = {
    taskId: value.taskId,
    taskRevision: value.taskRevision,
    maxPoints: value.maxPoints,
  };
  if (value.outcome === null) {
    return value.answer === null && value.earnedPoints === null
      ? {
          ...base,
          outcome: "unanswered",
          earnedPoints: 0,
          answers: [""],
          reviewable: true,
        }
      : null;
  }

  const answers =
    value.answer === null ? null : parseStoredAnswers(value.answer);
  if (value.answer !== null && answers === null) return null;
  switch (value.outcome) {
    case "CORRECT":
      return value.earnedPoints === null ||
        value.earnedPoints === value.maxPoints
        ? {
            ...base,
            outcome: "correct",
            earnedPoints: value.maxPoints,
            answers: answers ?? [""],
            reviewable: answers !== null,
          }
        : null;
    case "INCORRECT":
      return value.earnedPoints === null || value.earnedPoints === 0
        ? {
            ...base,
            outcome: "incorrect",
            earnedPoints: 0,
            answers: answers ?? [""],
            reviewable: answers !== null,
          }
        : null;
    case "PARTIAL":
      return integer(value.earnedPoints, 1, value.maxPoints - 1)
        ? {
            ...base,
            outcome: "partial",
            earnedPoints: value.earnedPoints,
            answers: answers ?? [""],
            reviewable: false,
          }
        : null;
    case "SKIPPED":
      return (value.earnedPoints === null || value.earnedPoints === 0) &&
        (answers !== null || value.answer === null)
        ? {
            ...base,
            outcome: "unanswered",
            earnedPoints: 0,
            answers: answers ?? [""],
            reviewable: true,
          }
        : null;
    case "UNGRADED":
      return value.earnedPoints === null
        ? {
            ...base,
            outcome: "ungraded",
            earnedPoints: null,
            answers: answers ?? [""],
            reviewable: false,
          }
        : null;
    default:
      return null;
  }
}

function buildHistoryEntry(
  id: string,
  blueprintVersion: string,
  contentRevision: string,
  startedAt: number,
  finishedAt: number,
  durationMs: number,
  deadlineAt: number | null,
  items: ParsedItem[],
  score: number,
  maxPoints: number,
): SimulationHistoryEntry {
  const results: SimulationGradeItem[] = items.map((item) => ({
    taskId: item.taskId,
    outcome:
      item.outcome === "correct"
        ? "correct"
        : item.outcome === "incorrect"
          ? "incorrect"
          : "unanswered",
    earnedPoints: item.earnedPoints ?? 0,
    maxPoints: item.maxPoints,
  }));
  return {
    id,
    blueprintVersion,
    startedAt,
    finishedAt,
    durationMs,
    timedOut: deadlineAt !== null && finishedAt >= deadlineAt,
    score,
    maxPoints,
    correctCount: results.filter(({ outcome }) => outcome === "correct").length,
    answeredCount: results.filter(({ outcome }) => outcome !== "unanswered")
      .length,
    taskIds: items.map(({ taskId }) => taskId),
    answers: items.map(({ answers }) => [...answers]),
    results,
    archiveSnapshot: {
      contentRevision,
      taskRevisions: items.map(({ taskRevision }) => taskRevision),
    },
  };
}

function parseStoredAnswers(value: unknown): string[] | null {
  if (typeof value !== "string" || value.length > 50_000) return null;
  try {
    const answers: unknown = JSON.parse(value);
    if (
      !Array.isArray(answers) ||
      answers.length < 1 ||
      answers.length > SIMULATION_MAX_ANSWER_PARTS ||
      !answers.every(
        (answer) =>
          typeof answer === "string" && answer.length <= MAX_ANSWER_LENGTH,
      )
    ) {
      return null;
    }
    return [...answers];
  } catch {
    return null;
  }
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
