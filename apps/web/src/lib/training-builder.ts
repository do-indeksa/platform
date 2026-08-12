import type { JournalAttempt } from "./attempt-journal";
import type { Attempt } from "./knowledge";

export const TRAINING_BUILDER_DRAFT_VERSION = 1;
export const TRAINING_BUILDER_MAX_TASKS = 10;

export const trainingBuilderDifficulties = [
  "foundation",
  "balanced",
  "advanced",
] as const;

export type TrainingBuilderDifficulty =
  (typeof trainingBuilderDifficulties)[number];

export type TrainingBuilderTask = {
  id: string;
  topic: string;
  difficulty: number;
};

export type TrainingBuilderPosition = {
  number: number;
  topicSlugs: string[];
  availableCount: number;
};

export type TrainingBuilderDraft = {
  version: typeof TRAINING_BUILDER_DRAFT_VERSION;
  blueprintVersion: string;
  quantities: Record<number, number>;
  difficulty: TrainingBuilderDifficulty;
  onlyNew: boolean;
  shuffle: boolean;
  prioritizeMistakes: boolean;
};

export type TrainingBuilderSelection = {
  taskIds: string[];
  counts: Record<number, number>;
};

export type TrainingBuilderAttempt = Pick<
  JournalAttempt,
  "taskId" | "outcome" | "submittedAt"
>;

type SelectionInput = {
  draft: TrainingBuilderDraft;
  positions: readonly TrainingBuilderPosition[];
  tasks: readonly TrainingBuilderTask[];
  attempts: readonly TrainingBuilderAttempt[];
  seed?: string;
};

export function createDefaultTrainingBuilderDraft(
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): TrainingBuilderDraft {
  const quantities: Record<number, number> = {};
  const preferred = [
    { number: 1, count: 3 },
    { number: 4, count: 2 },
  ];
  let total = 0;

  for (const choice of preferred) {
    const position = positions.find(({ number }) => number === choice.number);
    if (!position || position.availableCount < 1) continue;
    const count = Math.min(
      choice.count,
      position.availableCount,
      TRAINING_BUILDER_MAX_TASKS - total,
    );
    quantities[position.number] = count;
    total += count;
  }

  if (total === 0) {
    const first = positions.find(({ availableCount }) => availableCount > 0);
    if (first) quantities[first.number] = Math.min(3, first.availableCount);
  }

  return {
    version: TRAINING_BUILDER_DRAFT_VERSION,
    blueprintVersion,
    quantities,
    difficulty: "balanced",
    onlyNew: true,
    shuffle: true,
    prioritizeMistakes: false,
  };
}

export function mergeTrainingBuilderAttempts(
  journal: readonly TrainingBuilderAttempt[],
  legacy: readonly Attempt[],
): TrainingBuilderAttempt[] {
  const seen = new Set(
    journal.map(
      ({ taskId, outcome, submittedAt }) =>
        `${taskId}\u0000${outcome}\u0000${submittedAt}`,
    ),
  );
  const merged = [...journal];
  for (const attempt of legacy) {
    const outcome = attempt.correct ? "CORRECT" : "INCORRECT";
    const key = `${attempt.taskId}\u0000${outcome}\u0000${attempt.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ taskId: attempt.taskId, outcome, submittedAt: attempt.at });
  }
  return merged.toSorted(
    (left, right) =>
      Date.parse(left.submittedAt) - Date.parse(right.submittedAt),
  );
}

export function parseTrainingBuilderDraft(
  value: unknown,
  positions: readonly TrainingBuilderPosition[],
  blueprintVersion: string,
): TrainingBuilderDraft | null {
  if (
    !isRecord(value) ||
    value.version !== TRAINING_BUILDER_DRAFT_VERSION ||
    value.blueprintVersion !== blueprintVersion
  ) {
    return null;
  }
  if (
    !isRecord(value.quantities) ||
    !trainingBuilderDifficulties.includes(
      value.difficulty as TrainingBuilderDifficulty,
    ) ||
    typeof value.onlyNew !== "boolean" ||
    typeof value.shuffle !== "boolean" ||
    typeof value.prioritizeMistakes !== "boolean"
  ) {
    return null;
  }

  const availableByPosition = new Map(
    positions.map(({ number, availableCount }) => [number, availableCount]),
  );
  const quantities: Record<number, number> = {};
  let total = 0;
  for (const [rawNumber, rawQuantity] of Object.entries(value.quantities)) {
    if (!/^\d{1,2}$/.test(rawNumber)) return null;
    const number = Number(rawNumber);
    const available = availableByPosition.get(number);
    if (
      available === undefined ||
      !Number.isInteger(rawQuantity) ||
      (rawQuantity as number) < 1 ||
      (rawQuantity as number) > available
    ) {
      return null;
    }
    total += rawQuantity as number;
    if (total > TRAINING_BUILDER_MAX_TASKS) return null;
    quantities[number] = rawQuantity as number;
  }

  return {
    version: TRAINING_BUILDER_DRAFT_VERSION,
    blueprintVersion,
    quantities,
    difficulty: value.difficulty as TrainingBuilderDifficulty,
    onlyNew: value.onlyNew,
    shuffle: value.shuffle,
    prioritizeMistakes: value.prioritizeMistakes,
  };
}

export function setTrainingPositionQuantity(
  draft: TrainingBuilderDraft,
  position: TrainingBuilderPosition,
  requested: number,
): TrainingBuilderDraft {
  const otherTotal = Object.entries(draft.quantities).reduce(
    (sum, [number, quantity]) =>
      Number(number) === position.number ? sum : sum + quantity,
    0,
  );
  const quantity = Math.min(
    Math.max(0, Math.trunc(requested)),
    position.availableCount,
    Math.max(0, TRAINING_BUILDER_MAX_TASKS - otherTotal),
  );
  const quantities = { ...draft.quantities };
  if (quantity === 0) delete quantities[position.number];
  else quantities[position.number] = quantity;
  return { ...draft, quantities };
}

export function replaceTrainingPositions(
  draft: TrainingBuilderDraft,
  positions: readonly TrainingBuilderPosition[],
  selectedNumbers: readonly number[],
): TrainingBuilderDraft {
  const selected = new Set(selectedNumbers);
  const quantities: Record<number, number> = {};
  for (const position of positions) {
    if (
      selected.has(position.number) &&
      position.availableCount > 0 &&
      Object.keys(quantities).length < TRAINING_BUILDER_MAX_TASKS
    ) {
      quantities[position.number] = 1;
    }
  }
  return { ...draft, quantities };
}

export function buildTrainingSet({
  draft,
  positions,
  tasks,
  attempts,
  seed = "do-indeksa-training-builder",
}: SelectionInput): TrainingBuilderSelection {
  const latestByTask = new Map<string, SelectionInput["attempts"][number]>();
  for (const attempt of attempts) {
    const current = latestByTask.get(attempt.taskId);
    if (
      !current ||
      Date.parse(attempt.submittedAt) >= Date.parse(current.submittedAt)
    ) {
      latestByTask.set(attempt.taskId, attempt);
    }
  }

  const queues = positions
    .filter(({ number }) => (draft.quantities[number] ?? 0) > 0)
    .map((position) => {
      const topics = new Set(position.topicSlugs);
      const candidates = tasks
        .filter(({ topic }) => topics.has(topic))
        .filter(({ id }) => !draft.onlyNew || !latestByTask.has(id))
        .toSorted((left, right) =>
          compareTasks(left, right, latestByTask, draft),
        )
        .slice(0, draft.quantities[position.number]);
      return { position: position.number, tasks: candidates };
    });

  const taskIds: string[] = [];
  const counts: Record<number, number> = {};
  const longest = Math.max(0, ...queues.map(({ tasks }) => tasks.length));
  for (
    let index = 0;
    index < longest && taskIds.length < TRAINING_BUILDER_MAX_TASKS;
    index += 1
  ) {
    for (const queue of queues) {
      const task = queue.tasks[index];
      if (!task || taskIds.includes(task.id)) continue;
      taskIds.push(task.id);
      counts[queue.position] = (counts[queue.position] ?? 0) + 1;
      if (taskIds.length === TRAINING_BUILDER_MAX_TASKS) break;
    }
  }

  return {
    taskIds: draft.shuffle ? seededShuffle(taskIds, seed) : taskIds,
    counts,
  };
}

function compareTasks(
  left: TrainingBuilderTask,
  right: TrainingBuilderTask,
  latestByTask: ReadonlyMap<string, SelectionInput["attempts"][number]>,
  draft: TrainingBuilderDraft,
): number {
  const leftAttempt = latestByTask.get(left.id);
  const rightAttempt = latestByTask.get(right.id);
  return (
    (draft.prioritizeMistakes
      ? outcomePriority(leftAttempt?.outcome) -
        outcomePriority(rightAttempt?.outcome)
      : 0) ||
    difficultyPriority(left.difficulty, draft.difficulty) -
      difficultyPriority(right.difficulty, draft.difficulty) ||
    Date.parse(leftAttempt?.submittedAt ?? "1970-01-01") -
      Date.parse(rightAttempt?.submittedAt ?? "1970-01-01") ||
    left.id.localeCompare(right.id)
  );
}

function outcomePriority(outcome: JournalAttempt["outcome"] | undefined) {
  if (outcome === "INCORRECT" || outcome === "PARTIAL") return 0;
  if (outcome === "SKIPPED") return 1;
  if (outcome === undefined) return 2;
  return 3;
}

function difficultyPriority(
  difficulty: number,
  strategy: TrainingBuilderDifficulty,
) {
  if (strategy === "foundation") return difficulty;
  if (strategy === "advanced") return -difficulty;
  return Math.abs(difficulty - 3) * 10 + difficulty;
}

function seededShuffle(values: readonly string[], seed: string): string[] {
  const result = [...values];
  let state = hashSeed(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
