import type { TrainingBuilderPosition } from "@/lib/training-builder";
import type { TrainingPracticeTask } from "@/lib/training-practice-assignment";

export type TrainingBuilderPositionView = TrainingBuilderPosition & {
  name: string;
};

export type TrainingBuilderTaskView = TrainingPracticeTask;
