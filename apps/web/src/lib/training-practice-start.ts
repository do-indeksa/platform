import type { LearningRunOwnerId } from "./learning-run-owner";
import { usePracticeRuntime } from "./practice-runtime-store";
import {
  createTrainingPracticeAssignment,
  type TrainingPracticeTask,
} from "./training-practice-assignment";

export type BeginTrainingPracticeInput = {
  ownerId: LearningRunOwnerId;
  runId: string;
  startedAt: number;
  blueprintVersion: string;
  selectedTaskIds: readonly string[];
  catalog: readonly TrainingPracticeTask[];
};

type BeginTrainingPracticeDependencies = {
  createAssignment?: typeof createTrainingPracticeAssignment;
};

export async function beginTrainingPracticeRun(
  input: BeginTrainingPracticeInput,
  dependencies: BeginTrainingPracticeDependencies = {},
): Promise<boolean> {
  const initial = usePracticeRuntime.getState();
  if (initial.authOwnerId !== input.ownerId) return false;
  const ownerGeneration = initial.authOwnerGeneration;
  const assignment = await (
    dependencies.createAssignment ?? createTrainingPracticeAssignment
  )(
    input.runId,
    input.blueprintVersion,
    input.selectedTaskIds,
    input.catalog,
  );
  const current = usePracticeRuntime.getState();
  if (
    assignment === null ||
    current.authOwnerId !== input.ownerId ||
    current.authOwnerGeneration !== ownerGeneration
  ) {
    return false;
  }
  return current.start({ assignment, startedAt: input.startedAt });
}
