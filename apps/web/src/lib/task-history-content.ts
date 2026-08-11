export type TaskAttemptContent = {
  revision: string;
  slot: number;
  topicName: string;
  statementHtml: string;
  correctAnswerHtml: string;
  hintsHtml: string[];
  solutionHtml: string;
  fieldLabels: (string | null)[];
};

export function selectTaskAttemptContent(
  entryRevision: string | undefined,
  current: TaskAttemptContent,
  archived: TaskAttemptContent | null,
): {
  content: TaskAttemptContent;
  isArchived: boolean;
  revisionMismatch: boolean;
} {
  const content =
    archived !== null && archived.revision === entryRevision
      ? archived
      : current;
  return {
    content,
    isArchived: content.revision !== current.revision,
    revisionMismatch:
      entryRevision !== undefined && entryRevision !== content.revision,
  };
}
