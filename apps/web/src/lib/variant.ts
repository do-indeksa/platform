import { getTasks, type Task } from "./content";
import { getP1Blueprint, type P1Blueprint } from "./exam-blueprint";

export type GeneratedVariantTask = {
  examPosition: number;
  maxPoints: number;
  task: Task;
};

export type GeneratedVariant = {
  blueprint: P1Blueprint;
  tasks: GeneratedVariantTask[];
};

type GenerateVariantOptions = {
  version?: string;
  random?: () => number;
};

export function isExamEligibleTask(
  task: Pick<Task, "status" | "rubric">,
  maxPoints: number,
): boolean {
  return (
    task.status === "verified" &&
    Number.isInteger(maxPoints) &&
    maxPoints > 1 &&
    task.rubric.length > 0 &&
    task.rubric.reduce((sum, criterion) => sum + criterion.points, 0) ===
      maxPoints - 1
  );
}

export async function generateVariant({
  version,
  random = Math.random,
}: GenerateVariantOptions = {}): Promise<GeneratedVariant> {
  const blueprint = await getP1Blueprint(version);
  const taskCache = new Map<string, Promise<Task[]>>();
  const selectedIds = new Set<string>();
  const tasks: GeneratedVariantTask[] = [];

  for (const position of blueprint.positions) {
    const candidates = (
      await Promise.all(
        position.topicSlugs.map((topicSlug) => {
          const cached = taskCache.get(topicSlug);
          if (cached) return cached;
          const loaded = getTasks(topicSlug);
          taskCache.set(topicSlug, loaded);
          return loaded;
        }),
      )
    )
      .flat()
      .filter(
        (task) =>
          isExamEligibleTask(task, position.maxPoints) &&
          !selectedIds.has(task.id),
      );

    if (candidates.length === 0) {
      throw new Error(
        `no unused exam-eligible tasks for exam position ${position.number} (${position.topicSlugs.join(", ")})`,
      );
    }

    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new Error(
        "variant random source must return a finite value in [0, 1)",
      );
    }
    const task = candidates[Math.floor(sample * candidates.length)];
    selectedIds.add(task.id);
    tasks.push({
      examPosition: position.number,
      maxPoints: position.maxPoints,
      task,
    });
  }

  return { blueprint, tasks };
}

export async function resolveVariantTaskIds(
  taskIds: readonly string[],
  version?: string,
): Promise<GeneratedVariant | null> {
  const blueprint = await getP1Blueprint(version);
  if (
    taskIds.length !== blueprint.taskCount ||
    new Set(taskIds).size !== taskIds.length
  ) {
    return null;
  }

  const taskCache = new Map<string, Promise<Task[]>>();
  const tasks: GeneratedVariantTask[] = [];
  for (const [index, position] of blueprint.positions.entries()) {
    const candidates = (
      await Promise.all(
        position.topicSlugs.map((topicSlug) => {
          const cached = taskCache.get(topicSlug);
          if (cached) return cached;
          const loaded = getTasks(topicSlug);
          taskCache.set(topicSlug, loaded);
          return loaded;
        }),
      )
    ).flat();
    const task = candidates.find(
      (candidate) => candidate.id === taskIds[index],
    );
    if (!task) return null;
    tasks.push({
      examPosition: position.number,
      maxPoints: position.maxPoints,
      task,
    });
  }

  return { blueprint, tasks };
}

export async function resolveExamVariantTaskIds(
  taskIds: readonly string[],
  version?: string,
): Promise<GeneratedVariant | null> {
  const variant = await resolveVariantTaskIds(taskIds, version);
  if (
    !variant ||
    variant.tasks.some(
      ({ maxPoints, task }) => !isExamEligibleTask(task, maxPoints),
    )
  ) {
    return null;
  }

  return variant;
}
