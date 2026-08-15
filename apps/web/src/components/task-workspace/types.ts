import type { CheckPart } from "@/lib/answer";

export type TaskWorkspaceItem = {
  id: string;
  href: string;
  partCount: number;
  maxHints: number;
};

export type TaskWorkspaceStatus =
  "active" | "solved" | "retry" | "skipped" | "pending";

export type TaskWorkspaceProps = {
  taskId: string;
  slot: number;
  taskRevision: string;
  topicName: string;
  source: string;
  statementHtml: string;
  check: CheckPart[];
  hintsHtml: string[];
  solutionHtml: string;
  sequence: TaskWorkspaceItem[];
  taskIndex: number;
  returnTo: string;
  reportHref: string;
  reportAccessibleLabel: string;
  practiceId: string | null;
};
