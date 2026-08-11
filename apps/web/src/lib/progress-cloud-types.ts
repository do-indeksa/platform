export type ProgressCloudTask = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  answerPartCount: number;
};

export type ProgressCloudPosition = {
  ordinal: number;
  examPosition: number;
  maxPoints: number;
  candidates: ProgressCloudTask[];
};

export type ProgressCloudCatalog = {
  blueprintVersion: string;
  durationMinutes: number;
  taskCount: number;
  maxPoints: number;
  positions: ProgressCloudPosition[];
};
