import { getTasks } from "./content";
import { getP1Blueprint } from "./exam-blueprint";
import type {
  ProgressCloudCatalog,
  ProgressCloudTask,
} from "./progress-cloud-types";
import { MAX_TASK_ANSWER_PARTS } from "./task-draft";

export async function getProgressCloudCatalog(): Promise<ProgressCloudCatalog> {
  const blueprint = await getP1Blueprint();
  const taskCache = new Map<string, ReturnType<typeof getTasks>>();
  const positions = await Promise.all(
    blueprint.positions.map(async (position, index) => {
      const candidates = (
        await Promise.all(
          position.topicSlugs.map((topic) => {
            const cached = taskCache.get(topic);
            if (cached) return cached;
            const loaded = getTasks(topic);
            taskCache.set(topic, loaded);
            return loaded;
          }),
        )
      )
        .flat()
        .map(toCloudTask);
      return {
        ordinal: index + 1,
        examPosition: position.number,
        maxPoints: position.maxPoints,
        candidates,
      };
    }),
  );

  return {
    blueprintVersion: `${blueprint.examId}:${blueprint.version}`,
    durationMinutes: blueprint.durationMinutes,
    taskCount: blueprint.taskCount,
    maxPoints: blueprint.maxPoints,
    positions,
  };
}

function toCloudTask(
  task: Awaited<ReturnType<typeof getTasks>>[number],
): ProgressCloudTask {
  if (task.check.length < 1 || task.check.length > MAX_TASK_ANSWER_PARTS) {
    throw new Error(`task ${task.id} has an unsupported answer-part count`);
  }
  return {
    id: task.id,
    revision: task.revision,
    slot: task.slot,
    topic: task.topic,
    answerPartCount: task.check.length,
  };
}
