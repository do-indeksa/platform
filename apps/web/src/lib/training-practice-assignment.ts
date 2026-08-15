import { isPracticeCloudAssignment } from "./practice-cloud-contract";
import { practiceTaskSetRevision } from "./practice-cloud-revision";
import type {
  PracticeCloudAssignment,
  PracticeCloudTask,
} from "./practice-cloud-types";

const PLACEHOLDER_CONTENT_REVISION = `sha256:${"0".repeat(64)}`;

export type TrainingPracticeTask = PracticeCloudTask & {
  difficulty: number;
};

export async function createTrainingPracticeAssignment(
  runId: string,
  blueprintVersion: string,
  selectedTaskIds: readonly string[],
  catalog: readonly TrainingPracticeTask[],
): Promise<PracticeCloudAssignment | null> {
  if (
    selectedTaskIds.length < 1 ||
    new Set(selectedTaskIds).size !== selectedTaskIds.length ||
    new Set(catalog.map((task) => task.id)).size !== catalog.length
  ) {
    return null;
  }
  const catalogById = new Map(catalog.map((task) => [task.id, task]));
  const tasks: PracticeCloudTask[] = [];
  for (const taskId of selectedTaskIds) {
    const task = catalogById.get(taskId);
    if (task === undefined) return null;
    tasks.push({
      id: task.id,
      revision: task.revision,
      slot: task.slot,
      topic: task.topic,
      answerPartCount: task.answerPartCount,
    });
  }
  const assignment: PracticeCloudAssignment = {
    runId,
    blueprintVersion: `ftn-p1:${blueprintVersion}`,
    contentRevision: PLACEHOLDER_CONTENT_REVISION,
    tasks,
  };
  if (!isPracticeCloudAssignment(assignment)) return null;
  return {
    ...assignment,
    contentRevision: await practiceTaskSetRevision(tasks),
  };
}
