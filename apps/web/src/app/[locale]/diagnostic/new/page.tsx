import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DiagnosticRuntime,
  type DiagnosticTaskView,
} from "@/components/diagnostic";
import { redirect } from "@/i18n/navigation";
import { taskSetRevision } from "@/lib/content";
import { getDiagnosticCloudCatalog } from "@/lib/diagnostic-cloud-catalog";
import {
  DIAGNOSTIC_TASK_COUNT,
  parseDiagnosticRunQuery,
} from "@/lib/diagnostic-run";
import { renderMarkdown } from "@/lib/markdown";
import { generateVariant, resolveVariantTaskIds } from "@/lib/variant";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("diagnostic");
  return { title: t("inProgressTitle") };
}

export default async function NewDiagnosticPage({
  params,
  searchParams,
}: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const run = parseDiagnosticRunQuery(query, DIAGNOSTIC_TASK_COUNT);
  const variant = run ? await resolveVariantTaskIds(run.taskIds) : null;
  if (!run || !variant) {
    const fresh = await generateVariant();
    return redirect({
      href: {
        pathname: "/diagnostic/new",
        query: {
          run: crypto.randomUUID(),
          set: fresh.tasks.map(({ task }) => task.id).join(","),
        },
      },
      locale,
    });
  }

  const [topicT, diagnosticCatalog] = await Promise.all([
    getTranslations({ locale, namespace: "topics" }),
    getDiagnosticCloudCatalog(),
  ]);
  const tasks: DiagnosticTaskView[] = await Promise.all(
    variant.tasks.map(async ({ examPosition, task }) => ({
      id: task.id,
      revision: task.revision,
      slot: task.slot,
      examPosition,
      topic: task.topic,
      topicName: topicT(task.topic),
      statementHtml: await renderMarkdown(task.statement),
      fields: task.check.map(({ label, kind }) => ({ label, kind })),
    })),
  );

  return (
    <DiagnosticRuntime
      runId={run.runId}
      tasks={tasks}
      blueprintVersion={`${variant.blueprint.examId}:${variant.blueprint.version}`}
      contentRevision={taskSetRevision(variant.tasks.map(({ task }) => task))}
      diagnosticCatalog={diagnosticCatalog}
    />
  );
}
