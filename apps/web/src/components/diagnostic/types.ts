import type { CheckKind } from "@/lib/answer";

export type DiagnosticTaskView = {
  id: string;
  revision: string;
  slot: number;
  examPosition: number;
  topic: string;
  topicName: string;
  statementHtml: string;
  fields: { label?: string; kind: CheckKind }[];
};

export type DiagnosticResultTask = Pick<
  DiagnosticTaskView,
  "id" | "revision" | "slot" | "examPosition" | "topic" | "topicName"
> & {
  practiceTask: { id: string; topic: string } | null;
};
