export type DiagnosticCloudTask = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  answerPartCount: number;
};

export type DiagnosticCloudPosition = {
  ordinal: number;
  examPosition: number;
  candidates: DiagnosticCloudTask[];
};

export type DiagnosticCloudCatalog = {
  blueprintVersion: string;
  positions: DiagnosticCloudPosition[];
};
