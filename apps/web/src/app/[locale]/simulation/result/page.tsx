import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SimulationResult } from "@/components/simulation";
import { redirect } from "@/i18n/navigation";
import { getTopics, taskSetRevision } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";
import {
  buildSimulationTaskView,
  buildSimulationTaskViews,
} from "@/lib/simulation-content";
import type { SimulationResultContentCandidate } from "@/lib/simulation-result-content";
import {
  parseSimulationRunQuery,
  parseSimulationTaskRevisions,
} from "@/lib/simulation-run";
import { resolveSimulationTaskRevisionCandidates } from "@/lib/simulation-task-revisions";
import {
  resolveVariantTaskIds,
  type GeneratedVariantTask,
} from "@/lib/variant";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulation");
  return { title: t("resultTitle") };
}

export default async function SimulationResultPage({
  params,
  searchParams,
}: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const requestedVersion =
    typeof query.version === "string" ? query.version : undefined;
  let blueprint;
  try {
    blueprint = await getP1Blueprint(requestedVersion);
  } catch {
    return redirect({ href: "/simulation", locale });
  }
  const run = parseSimulationRunQuery(query, blueprint.taskCount);
  const variant = run
    ? await resolveVariantTaskIds(run.taskIds, run.blueprintVersion)
    : null;
  if (!run || !variant) return redirect({ href: "/simulation", locale });
  const [topicT, topics] = await Promise.all([
    getTranslations({ locale, namespace: "topics" }),
    getTopics(),
  ]);
  const topicSlugs = new Set(topics.map(({ slug }) => slug));
  const topicName = (topic: string) =>
    topicSlugs.has(topic) ? topicT(topic) : topic;
  const requestedRevisions = parseSimulationTaskRevisions(
    query.revisions,
    run.taskIds.length,
  );
  const [tasks, archiveCandidate] = await Promise.all([
    buildSimulationTaskViews(variant, topicName),
    requestedRevisions === null
      ? null
      : buildArchiveCandidate(variant.tasks, requestedRevisions, topicName),
  ]);

  return (
    <SimulationResult
      run={run}
      tasks={tasks}
      contentRevision={taskSetRevision(variant.tasks.map(({ task }) => task))}
      archiveCandidate={archiveCandidate}
    />
  );
}

async function buildArchiveCandidate(
  current: readonly GeneratedVariantTask[],
  revisions: readonly string[],
  topicName: (topic: string) => string,
): Promise<SimulationResultContentCandidate> {
  const resolved = await resolveSimulationTaskRevisionCandidates(
    current.map(({ task }) => task),
    revisions,
  );
  const selected = resolved.map((task, index) => task ?? current[index].task);
  return {
    contentRevision: taskSetRevision(selected),
    tasks: await Promise.all(
      selected.map((task, index) =>
        task.revision === current[index].task.revision
          ? null
          : buildSimulationTaskView({ ...current[index], task }, topicName),
      ),
    ),
  };
}
