import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DiagnosticResult,
  type DiagnosticResultTask,
} from "@/components/diagnostic";
import { redirect } from "@/i18n/navigation";
import { getTaskReferences, taskSetRevision } from "@/lib/content";
import {
  DIAGNOSTIC_TASK_COUNT,
  parseDiagnosticRunQuery,
} from "@/lib/diagnostic-run";
import { resolveVariantTaskIds } from "@/lib/variant";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("diagnostic");
  return { title: t("resultTitle"), description: t("description") };
}

export default async function DiagnosticResultPage({
  params,
  searchParams,
}: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const run = parseDiagnosticRunQuery(query, DIAGNOSTIC_TASK_COUNT);
  if (!run) {
    return redirect({ href: "/diagnostic", locale });
  }
  const variant = await resolveVariantTaskIds(run.taskIds);
  if (!variant) return redirect({ href: "/diagnostic", locale });
  const references = await getTaskReferences();

  const topicT = await getTranslations({ locale, namespace: "topics" });
  const tasks: DiagnosticResultTask[] = variant.tasks.map(
    ({ examPosition, task }) => {
      const practiceTask = references.find(
        (candidate) =>
          candidate.topic === task.topic && candidate.id !== task.id,
      );
      return {
        id: task.id,
        revision: task.revision,
        slot: task.slot,
        examPosition,
        topic: task.topic,
        topicName: topicT(task.topic),
        answerPartCount: task.check.length,
        practiceTask: practiceTask
          ? { id: practiceTask.id, topic: practiceTask.topic }
          : null,
      };
    },
  );

  return (
    <DiagnosticResult
      runId={run.runId}
      tasks={tasks}
      blueprintVersion={`${variant.blueprint.examId}:${variant.blueprint.version}`}
      contentRevision={taskSetRevision(variant.tasks.map(({ task }) => task))}
    />
  );
}
