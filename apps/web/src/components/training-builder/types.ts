import type {
  TrainingBuilderPosition,
  TrainingBuilderTask,
} from "@/lib/training-builder";

export type TrainingBuilderPositionView = TrainingBuilderPosition & {
  name: string;
};

export type TrainingBuilderTaskView = TrainingBuilderTask;
